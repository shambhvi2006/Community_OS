import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Need } from '../types';

interface MapViewProps {
  needs: Need[];
  onNeedClick: (need: Need) => void;
}

function getMarkerColor(urgencyScore: number): string {
  if (urgencyScore > 8) return '#EF4444';
  if (urgencyScore >= 4) return '#F97316';
  return '#22C55E';
}

function getUrgencyLabel(urgencyScore: number): string {
  if (urgencyScore > 8) return 'Critical';
  if (urgencyScore >= 4) return 'Moderate';
  return 'Low';
}

export default function MapView({ needs, onNeedClick }: MapViewProps) {
  // Center on Delhi/NCR area
  const center: [number, number] = [28.6139, 77.209];

  return (
    <div className="relative h-full min-h-[400px] rounded-lg border border-gray-200 overflow-hidden">
      <MapContainer
        center={center}
        zoom={10}
        style={{ height: '100%', minHeight: '400px', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {needs.map((need) => (
          <CircleMarker
            key={need.id}
            center={[need.location.lat, need.location.lng]}
            radius={10}
            fillColor={getMarkerColor(need.urgency_score)}
            color={getMarkerColor(need.urgency_score)}
            weight={2}
            opacity={0.9}
            fillOpacity={0.7}
            eventHandlers={{
              click: () => onNeedClick(need),
            }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{need.need_type}</p>
                <p className="text-gray-600">{need.location.description}</p>
                <p>
                  Urgency: <span className="font-medium">{need.urgency_score.toFixed(1)}</span>
                  {' '}({getUrgencyLabel(need.urgency_score)})
                </p>
                <p>Severity: {need.severity} · Affected: {need.affected_count}</p>
                <p className="text-xs text-gray-400 mt-1">Status: {need.status}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] flex items-center gap-3 rounded bg-white/90 px-3 py-1.5 text-xs shadow">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#EF4444' }} />
          &gt;8 Critical
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#F97316' }} />
          4–8 Moderate
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#22C55E' }} />
          &lt;4 Low
        </span>
      </div>
    </div>
  );
}
