import { useState } from 'react';

interface BlogPost {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'approved' | 'published';
}

const MOCK_POSTS: BlogPost[] = [
  {
    id: '1',
    title: 'Community Rallies After Flooding',
    content:
      'When heavy rains hit the northern district, volunteers mobilized within hours to deliver food kits and medical supplies to over 200 affected families…',
    status: 'draft',
  },
  {
    id: '2',
    title: 'Volunteer Spotlight: Medical Camp Success',
    content:
      'Last week, a team of 15 volunteers organized a medical camp that served 350 community members in the eastern zone…',
    status: 'published',
  },
];

export default function BlogPage() {
  const [posts, setPosts] = useState(MOCK_POSTS);
  const [selected, setSelected] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const selectedPost = posts.find((p) => p.id === selected);

  const selectPost = (id: string) => {
    const post = posts.find((p) => p.id === id);
    setSelected(id);
    setEditContent(post?.content ?? '');
  };

  const saveEdit = () => {
    if (!selected) return;
    setPosts((prev) =>
      prev.map((p) => (p.id === selected ? { ...p, content: editContent } : p))
    );
  };

  const publish = (id: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'published' } : p))
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Blog Editor</h1>
        <button
          type="button"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 opacity-50 cursor-not-allowed"
          disabled
          title="Gemini integration pending"
        >
          Generate Story
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Story list */}
        <div className="lg:col-span-1 space-y-2">
          {posts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectPost(p.id)}
              className={`w-full text-left rounded-lg p-3 shadow text-sm ${
                selected === p.id ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-white'
              }`}
            >
              <p className="font-medium text-gray-800">{p.title}</p>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  p.status === 'published'
                    ? 'bg-green-100 text-green-700'
                    : p.status === 'approved'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {p.status}
              </span>
            </button>
          ))}
        </div>

        {/* Editor + Preview */}
        <div className="lg:col-span-2 space-y-4">
          {selectedPost ? (
            <>
              <div className="rounded-lg bg-white p-4 shadow">
                <h2 className="text-lg font-semibold text-gray-700 mb-2">Edit</h2>
                <textarea
                  className="w-full border rounded p-2 text-sm min-h-[150px]"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700"
                  >
                    Save
                  </button>
                  {selectedPost.status !== 'published' && (
                    <button
                      type="button"
                      onClick={() => publish(selectedPost.id)}
                      className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
                    >
                      Publish
                    </button>
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-white p-4 shadow">
                <h2 className="text-lg font-semibold text-gray-700 mb-2">Preview</h2>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{selectedPost.title}</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{editContent}</p>
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-white p-6 shadow text-center text-sm text-gray-400">
              Select a story to edit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
