import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';

const EXTERNAL_CHATBOT_URL = import.meta.env.VITE_EXTERNAL_CHATBOT_URL || '';

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
}

interface ExtractedNeed {
  need_type: string;
  location: { lat: number; lng: number; description: string };
  severity: number;
  affected_count: number;
  vulnerability_flags: string[];
  language: string;
  summary?: string;
}

interface ExtractedVolunteer {
  name: string;
  phone: string;
  location: { lat: number; lng: number; description: string };
  skills: string[];
}

const SYSTEM_PROMPT = `You are CommunityOS, a humanitarian aid chatbot. You help with TWO things:
1. Report community needs
2. Register new volunteers

DETECTING INTENT:
- If the user says things like "register", "volunteer", "sign up", "I want to help", "join as volunteer" → volunteer registration flow
- Otherwise → need reporting flow

FOR NEED REPORTING:
Gather: need type, location, severity (1-10), affected count, vulnerable groups.
When you have ALL the info, output ONLY this JSON block (no other text):
\`\`\`json
{"type":"need","ready":true,"need_type":"food_shortage","location":{"lat":28.6139,"lng":77.209,"description":"Connaught Place, Delhi"},"severity":8,"affected_count":20,"vulnerability_flags":["children","elderly"],"language":"en","summary":"20 people need food near CP"}
\`\`\`

FOR VOLUNTEER REGISTRATION:
Gather: full name, phone number (+91...), location/area, skills (from: first_aid, medical, food_distribution, driving, logistics, counseling, teaching, rescue).
When you have ALL the info, output ONLY this JSON block (no other text):
\`\`\`json
{"type":"volunteer","ready":true,"name":"Rahul Kumar","phone":"+919876543210","location":{"lat":28.6139,"lng":77.209,"description":"Connaught Place, Delhi"},"skills":["first_aid","driving"]}
\`\`\`

CRITICAL RULES:
- Be warm, empathetic, and brief
- Support English, Hindi, and Punjabi
- Ask ONE follow-up at a time if info is missing
- For Indian locations, estimate lat/lng coordinates (Delhi NCR area as default)
- When user confirms with "yes", output the JSON block immediately
- The JSON block MUST be wrapped in triple backtick json markers
- Do NOT include any text before or after the JSON block when outputting it`;

function parseJson(text: string): any | null {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

export default function Chatbot() {
  const { ngoId, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'bot', text: 'Hi, I\'m CommunityOS. I can help you report a community need or register as a volunteer. What would you like to do?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingNeed, setPendingNeed] = useState<ExtractedNeed | null>(null);
  const [pendingVolunteer, setPendingVolunteer] = useState<ExtractedVolunteer | null>(null);
  const [saving, setSaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatHistory = useRef<{ role: string; parts: { text: string }[] }[]>([
    { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: 'Understood. I will help users report needs or register as volunteers.' }] },
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const callGemini = useCallback(async (userText: string): Promise<string> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini API key not configured');

    chatHistory.current.push({ role: 'user', parts: [{ text: userText }] });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: chatHistory.current }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${res.status}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    chatHistory.current.push({ role: 'model', parts: [{ text }] });
    return text;
  }, []);

  const resetChat = () => {
    chatHistory.current = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: 'Understood.' }] },
    ];
    setPendingNeed(null);
    setPendingVolunteer(null);
  };

  const saveNeed = async (need: ExtractedNeed) => {
    if (!ngoId) return;
    setSaving(true);
    try {
      const vulnFlags = need.vulnerability_flags || [];
      const weights: Record<string, number> = { children: 0.4, elderly: 0.3, pregnant: 0.4, disabled: 0.2, medical_emergency: 0.6 };
      const vulnMult = Math.min(1.0 + vulnFlags.reduce((s, f) => s + (weights[f] || 0), 0), 2.0);
      const severity = need.severity || 5;
      const affected = need.affected_count || 1;
      const urgencyScore = parseFloat(((severity * affected * vulnMult) / 0.1).toFixed(1));

      const docRef = await addDoc(collection(db, 'needs'), {
        source: 'web', location: need.location, need_type: need.need_type,
        severity, affected_count: affected, vulnerability_flags: vulnFlags,
        urgency_score: Math.min(urgencyScore, 500),
        urgency_breakdown: { severity, affected_count: affected, vulnerability_flags: vulnFlags, vulnerability_multiplier: vulnMult, hours_since_reported: 0.1, urgency_score: Math.min(urgencyScore, 500), computed_at: new Date().toISOString() },
        status: 'new', ngo_id: ngoId, consent_token: `ct_${Date.now()}`,
        raw_input: messages.filter(m => m.role === 'user').map(m => m.text).join(' | '),
        language: need.language || 'en',
        created_at: serverTimestamp(), updated_at: serverTimestamp(),
        audit_trail_id: `audit_${Date.now()}`,
      });

      addBotMsg(`Need reported successfully. ID: ${docRef.id}. It will appear on the dashboard shortly. Want to report another?`);

      // Dispatch custom event so LiveOperations picks it up immediately
      window.dispatchEvent(new CustomEvent('communityos:need-created', { detail: { id: docRef.id } }));

      resetChat();
    } catch (err: any) {
      addBotMsg(`Failed to save: ${err.message}`);
    }
    setSaving(false);
  };

  const saveVolunteer = async (vol: ExtractedVolunteer) => {
    if (!ngoId) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'volunteers'), {
        name: vol.name, phone: vol.phone, location: vol.location, skills: vol.skills,
        ngo_id: ngoId, reliability_score: 50, burnout_factor: 1.0, status: 'available',
        availability: { windows: [{ day: 'monday', start: '09:00', end: '17:00' }, { day: 'wednesday', start: '09:00', end: '17:00' }, { day: 'friday', start: '09:00', end: '17:00' }] },
        task_history: { total_completed: 0, total_declined: 0, total_escalated: 0, avg_response_time_minutes: 0, avg_feedback_rating: 0 },
        created_at: serverTimestamp(), updated_at: serverTimestamp(),
      });
      addBotMsg(`${vol.name} registered as a volunteer. They are now available for dispatch on the Volunteers page.`);
      resetChat();
    } catch (err: any) {
      addBotMsg(`Failed to register: ${err.message}`);
    }
    setSaving(false);
  };

  const addBotMsg = (text: string) => {
    setMessages(prev => [...prev, { id: String(Date.now()), role: 'bot', text }]);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ngoId) return;
    setLoading(true);
    addBotMsg('Processing image... extracting inventory items from handwriting.');

    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: 'Extract all inventory items from this handwritten list. Return ONLY a JSON array: [{"resource_type":"item_name_snake_case","quantity":number}]. Common types: food_kits, medical_supplies, blankets, water_bottles, rice_bags, dal_packets, medicines, first_aid_kits, hygiene_kits, tents, clothing_packs.' },
              { inlineData: { mimeType: file.type, data: base64 } }
            ]}]
          }),
        }
      );
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('Could not read the image');

      const items = JSON.parse(jsonMatch[0]);
      let count = 0;
      for (const item of items) {
        if (item.resource_type && item.quantity) {
          await addDoc(collection(db, 'inventory'), {
            resource_type: item.resource_type, quantity: Number(item.quantity) || 0,
            location: { lat: 0, lng: 0, description: 'Uploaded via chatbot' },
            ngo_id: ngoId, status: 'available',
            created_at: serverTimestamp(), updated_at: serverTimestamp(),
          });
          count++;
        }
      }
      addBotMsg(`Extracted ${count} items from the image and added to inventory:\n${items.map((i: any) => `- ${i.resource_type.replace(/_/g, ' ')}: ${i.quantity}`).join('\n')}`);
    } catch (err: any) {
      addBotMsg(`Failed to process image: ${err.message}`);
    }
    setLoading(false);
    e.target.value = '';
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading || saving) return;

    setMessages(prev => [...prev, { id: String(Date.now()), role: 'user', text }]);
    setInput('');
    setLoading(true);

    // Handle confirmations
    if (pendingNeed && /^(yes|haan|ha|confirm|save|submit)/i.test(text)) {
      await saveNeed(pendingNeed);
      setLoading(false);
      return;
    }
    if (pendingVolunteer && /^(yes|haan|ha|confirm|save|submit)/i.test(text)) {
      await saveVolunteer(pendingVolunteer);
      setLoading(false);
      return;
    }
    // Handle rejections
    if ((pendingNeed || pendingVolunteer) && /^(no|nahi|cancel|edit)/i.test(text)) {
      setPendingNeed(null);
      setPendingVolunteer(null);
      addBotMsg('OK, what would you like to change?');
      setLoading(false);
      return;
    }

    try {
      const response = await callGemini(text);
      const parsed = parseJson(response);
      const cleanText = response.replace(/```json[\s\S]*?```/g, '').trim();

      if (parsed?.type === 'volunteer' && parsed.ready) {
        setPendingVolunteer(parsed);
        setPendingNeed(null);
        addBotMsg(cleanText || `Volunteer details:\n\nName: ${parsed.name}\nPhone: ${parsed.phone}\nLocation: ${parsed.location.description}\nSkills: ${parsed.skills.join(', ')}\n\nShall I register? (Yes/No)`);
      } else if (parsed?.ready && (parsed.type === 'need' || parsed.need_type)) {
        setPendingNeed(parsed);
        setPendingVolunteer(null);
        addBotMsg(cleanText || `Need details:\n\nType: ${parsed.need_type?.replace(/_/g, ' ')}\nLocation: ${parsed.location?.description}\nSeverity: ${parsed.severity}/10\nAffected: ${parsed.affected_count}\nVulnerable: ${parsed.vulnerability_flags?.join(', ') || 'none'}\n\nShall I submit? (Yes/No)`);
      } else {
        setPendingNeed(null);
        setPendingVolunteer(null);
        addBotMsg(cleanText || response);
      }
    } catch (err: any) {
      addBotMsg(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 flex items-center justify-center transition-transform hover:scale-105"
        aria-label={isOpen ? 'Close chatbot' : 'Open chatbot'}>
        {isOpen ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        )}
      </button>

      {isOpen && EXTERNAL_CHATBOT_URL && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl bg-white shadow-2xl border border-gray-200 flex flex-col" style={{ height: '500px' }}>
          <div className="flex items-center gap-2 rounded-t-xl bg-indigo-600 px-4 py-3 text-white">
            <div className="h-2 w-2 rounded-full bg-green-400" />
            <span className="font-semibold text-sm">CommunityOS Bot</span>
          </div>
          <iframe src={EXTERNAL_CHATBOT_URL} className="flex-1 w-full border-0 rounded-b-xl" title="CommunityOS Chatbot" />
        </div>
      )}

      {isOpen && !EXTERNAL_CHATBOT_URL && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl bg-white shadow-2xl border border-gray-200 flex flex-col" style={{ height: '500px' }}>
          <div className="flex items-center gap-2 rounded-t-xl bg-indigo-600 px-4 py-3 text-white">
            <div className="h-2 w-2 rounded-full bg-green-400" />
            <span className="font-semibold text-sm">CommunityOS Bot</span>
            <span className="text-xs opacity-75 ml-auto">Report a need | Register volunteer</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'
                }`}>{msg.text}</div>
              </div>
            ))}
            {(loading || saving) && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-400 animate-pulse">
                  {saving ? 'Saving...' : 'Thinking...'}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-gray-200 p-3">
            <div className="flex gap-2">
              <label className="flex items-center justify-center rounded-lg border border-gray-300 px-2 py-2 cursor-pointer hover:bg-gray-50 text-gray-500">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={loading || saving} />
              </label>
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder={pendingNeed || pendingVolunteer ? 'Type "yes" to confirm...' : 'Need / volunteer / upload inventory image...'}
                disabled={loading || saving}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50" />
              <button onClick={sendMessage} disabled={loading || saving || !input.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
