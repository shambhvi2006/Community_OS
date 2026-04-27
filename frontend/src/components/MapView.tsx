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

/**
 * MapView displays open Needs as color-coded markers on a map.
 * Uses a simple div placeholder — Google Maps JS API can be loaded via
 * @vis.gl/react-google-maps or a script tag when a valid API key is configured.
 *
 * Default center: India (lat: 20.5937, lng: 78.9629)
 */
export default function MapView({ needs, onNeedClick }: MapViewProps) {
  return (
    <div className="relative h-full min-h-[400px] rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
      {/* Map placeholder — replace with Google Maps integration when API key is available */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
        <p className="text-sm text-gray-400">
          Google Maps · Center: 20.5937°N, 78.9629°E
        </p>
      </div>

      {/* Marker overlay */}
      <div className="absolute inset-0 p-4 overflow-auto">
        <div className="flex flex-wrap gap-2">
          {needs.map((need) => (
            <button
              key={need.id}
              type="button"
              onClick={() => onNeedClick(need)}
              title={`${need.need_type} — urgency: ${need.urgency_score.toFixed(1)}`}
              className="group relative flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white shadow transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{ backgroundColor: getMarkerColor(need.urgency_score) }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full bg-white/40"
                aria-hidden="true"
              />
              <span>{need.need_type}</span>
              <span className="opacity-80">({need.urgency_score.toFixed(1)})</span>

              {/* Tooltip on hover */}
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-max max-w-[200px] rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                {need.need_type} · {getUrgencyLabel(need.urgency_score)} · Score{' '}
                {need.urgency_score.toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 flex items-center gap-3 rounded bg-white/90 px-3 py-1.5 text-xs shadow">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#EF4444' }} />
          &gt;8
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#F97316' }} />
          4–8
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#22C55E' }} />
          &lt;4
        </span>
      </div>
    </div>
  );
}
