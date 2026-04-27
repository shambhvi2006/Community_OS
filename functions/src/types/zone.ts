export interface Zone {
  id: string;
  ngo_id: string;
  name: string;
  boundary: { lat: number; lng: number }[]; // Polygon vertices
  assigned_coordinators: string[];
}
