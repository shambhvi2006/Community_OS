export interface HealthStatus {
  status: 'healthy' | 'degraded';
  services: {
    firestore: 'up' | 'down';
    gemini: 'up' | 'down';
    twilio: 'up' | 'down';
  };
  timestamp: string;
}
