# Implementation Plan: CommunityOS Core Platform

## Overview

This plan incrementally builds the CommunityOS platform from foundation (Firebase setup, auth, Firestore schema) through intelligence (urgency engine, matching), action (dispatch, debrief), dashboard, and advanced features (forecasting, overflow, blog). All existing prototype code is replaced. The implementation uses TypeScript throughout, with Jest + fast-check for backend testing, Vitest + fast-check for frontend testing, and Playwright for E2E.

## Tasks

- [x] 1. Project scaffolding, Firebase configuration, and Firestore schema
  - [x] 1.1 Initialize monorepo structure with `functions/` (Cloud Functions v2, TypeScript) and `frontend/` (React 18 + Vite 5 + Tailwind CSS 3) directories; add root `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`; configure `asia-south1` region; remove old `server.js`, `public/index.html`, `communityos_whatsapp.html`
    - Set up `functions/package.json` with firebase-functions v2, firebase-admin, typescript, jest, fast-check, ts-jest
    - Set up `frontend/package.json` with react 18, vite 5, tailwind css 3, vitest, fast-check, playwright
    - Create `tsconfig.json` for both packages
    - _Requirements: 1.1, 1.4, 1.5_

  - [x] 1.2 Define all TypeScript interfaces and types in `functions/src/types/` matching the design data models: `Need`, `Volunteer`, `Dispatch`, `NGO`, `InventoryItem`, `Forecast`, `Zone`, `Debrief`, `Consent`, `AuditEntry`, `SystemAlert`, `Post`, `Conversation`, `QueuedMessage`, `ApiToken`, `UrgencyScoreBreakdown`, `MatchScoreBreakdown`, `ExtractionResult`, `HealthStatus`
    - One file per domain: `need.ts`, `volunteer.ts`, `dispatch.ts`, `ngo.ts`, `inventory.ts`, `forecast.ts`, `zone.ts`, `debrief.ts`, `consent.ts`, `audit.ts`, `alert.ts`, `post.ts`, `conversation.ts`, `queue.ts`, `health.ts`
    - Export all types from `functions/src/types/index.ts`
    - _Requirements: 1.2, 1.3_

  - [x] 1.3 Write Firestore Security Rules in `firestore.rules` enforcing tenant isolation by `ngo_id`, RBAC role checks, and append-only audit trail subcollection; write composite indexes in `firestore.indexes.json`
    - Implement `isAuthenticated()`, `getUserNgoId()`, `getUserRole()`, `isTenantMatch()`, `isSuperAdmin()` helper functions
    - Rules for: `ngos`, `needs`, `needs/{needId}/audit_entries`, `volunteers`, `dispatches`, `inventory`, `forecasts`, `zones`, `debriefs`, `consents`, `system_alerts`, `posts`, `conversations`, `message_queue`
    - Composite indexes: `(ngo_id, status, urgency_score DESC)`, `(ngo_id, status, created_at DESC)`, `(ngo_id, status, reliability_score DESC)`, `(ngo_id, need_id, status)`, `(ngo_id, resource_type, status)`, `(ngo_id, need_type, created_at DESC)`
    - _Requirements: 3.1, 3.2, 4.3, 16.3_

  - [ ]* 1.4 Write Firestore Security Rules unit tests using `@firebase/rules-unit-testing` to validate tenant isolation (cross-tenant read/write rejection), RBAC enforcement (all four roles), and audit trail immutability
    - **Property 1: Tenant Data Isolation** — generate random ngo_id pairs, verify cross-tenant access is denied
    - **Property 2: RBAC Permission Matrix Enforcement** — generate role/action combinations, verify permission matrix
    - **Validates: Requirements 3.1, 3.2, 3.4, 4.3, 4.4, 16.3**

- [x] 2. Firebase Authentication, Google SSO, and RBAC
  - [x] 2.1 Implement Firebase Auth setup in `functions/src/auth/` with Google SSO provider configuration; create `setCustomClaims` Cloud Function (HTTPS callable) that sets `role` and `ngo_id` custom claims on a user's Firebase Auth token; create `onUserCreate` trigger that creates a user profile document in Firestore `users/{uid}` with default role `volunteer`
    - Only `ngo_admin` and `super_admin` can call `setCustomClaims`
    - Validate that the target user belongs to the same `ngo_id` (unless caller is `super_admin`)
    - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2_

  - [x] 2.2 Implement RBAC middleware in `functions/src/middleware/auth.ts` — a reusable function that validates Firebase ID tokens, extracts `role` and `ngo_id` from custom claims, and enforces role-based access on all HTTPS Cloud Function endpoints; return HTTP 401 for missing/invalid tokens, HTTP 403 for insufficient permissions
    - Create `requireRole(...roles)` middleware factory
    - Create `requireTenantMatch()` middleware that validates `ngo_id` claim matches target document
    - Log unauthorized attempts with actor, action, and target resource
    - _Requirements: 2.4, 3.3, 3.4, 4.3, 4.4, 4.5_

  - [ ]* 2.3 Write unit tests for auth middleware and custom claims logic
    - Test token validation, role extraction, tenant matching, 401/403 responses
    - _Requirements: 2.4, 4.4_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Audit Trail Service
  - [x] 4.1 Implement `auditTrailService` in `functions/src/services/audit-trail.ts` with `append(need_id, entry)` and `getTrail(need_id)` methods; writes to `needs/{needId}/audit_entries/{entryId}` subcollection; validate all required fields (`timestamp`, `actor_id`, `actor_role`, `action_type`, `previous_value`, `new_value`, `source`)
    - Auto-generate entry ID and timestamp
    - _Requirements: 16.1, 16.2_

  - [ ]* 4.2 Write property test for audit trail completeness
    - **Property 13: Audit Trail Completeness and Immutability** — generate random sequences of N actions, verify trail contains exactly N entries with all required fields
    - **Validates: Requirements 16.1, 16.2**

- [x] 5. Consent Service
  - [x] 5.1 Implement `consentService` in `functions/src/services/consent.ts` with `requestConsent()`, `grantConsent()`, `revokeConsent()`, `hasValidConsent()` methods; stores consent tokens in `consents/{consentId}` collection; on revocation, anonymize reporter personal data in all associated Need documents
    - Generate cryptographic consent token ID
    - `revokeConsent` sets `status: 'revoked'`, `revoked_at` timestamp, and triggers anonymization
    - `hasValidConsent` checks for active (non-revoked) token for phone + ngo_id
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [ ]* 5.2 Write property test for consent enforcement
    - **Property 14: Consent Enforcement** — generate random phone/ngo_id combinations with and without valid consent, verify operations are rejected when no valid consent exists
    - **Validates: Requirements 17.3, 17.5**

- [x] 6. Urgency Engine
  - [x] 6.1 Implement `urgencyEngine` in `functions/src/engines/urgency.ts` with `computeScore(need)`, `serializeBreakdown()`, `parseBreakdown()`, `formatBreakdown()` methods; compute `urgency_score = (severity × affected_count × vulnerability_multiplier) / hours_since_reported`; compute vulnerability_multiplier by summing flag weights (children: 0.4, elderly: 0.3, pregnant: 0.4, disabled: 0.2, medical_emergency: 0.6) starting from 1.0, capped at 2.0; default severity to 3 and affected_count to 1 when missing; store full breakdown alongside Need
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 24.1, 24.2, 24.3_

  - [x] 6.2 Implement Firestore `onWrite` trigger on `needs/{needId}` that invokes the urgency engine on Need creation/update; implement Cloud Scheduler function that recomputes urgency_score for all open Needs every 15 minutes
    - _Requirements: 5.4_

  - [ ]* 6.3 Write property tests for urgency engine
    - **Property 3: Urgency Score Formula Correctness** — generate random valid severity ∈ [1,10], affected_count ≥ 1, any combination of vulnerability_flags, hours_since_reported > 0; verify formula output matches expected computation
    - **Property 22: Urgency Score Serialization Round-Trip** — generate random UrgencyScoreBreakdown objects, verify `serialize(parse(serialize(x))) === serialize(x)`
    - **Property 23: Urgency Score Human-Readable Format Completeness** — generate random breakdowns, verify all component values appear in formatted string
    - **Validates: Requirements 5.1, 5.2, 5.3, 24.3, 24.4**

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Matching Engine
  - [x] 8.1 Implement haversine distance function in `functions/src/utils/haversine.ts` computing distance in km between two lat/lng coordinate pairs
    - _Requirements: 9.3_

  - [ ]* 8.2 Write property test for haversine distance
    - **Property 6: Haversine Distance Properties** — generate random valid coordinate pairs, verify non-negativity, identity (distance(A,A)=0), symmetry (distance(A,B)=distance(B,A)), and triangle inequality
    - **Validates: Requirements 9.3**

  - [x] 8.3 Implement `matchingEngine` in `functions/src/engines/matching.ts` with `findMatches(need, ngo_id)`, `computeSkillMatch()`, `computeDistance()`, `computeAvailability()` methods; compute `match_score = skill_match × (1/(distance_km+1)) × availability_score × (1/burnout_factor)`; for severity > 7, multiply by `reliability_score/100`; exclude volunteers with status "busy", burnout_factor > 5.0, or who declined the same Need; return top-3 with full breakdowns; flag for overflow if fewer than 3 score above 0.1
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 18.4_

  - [ ]* 8.4 Write property tests for matching engine
    - **Property 5: Match Score Formula Correctness** — generate random valid Need/Volunteer pairs, verify formula output
    - **Property 7: Matching Engine Exclusion and Ranking** — generate random volunteer sets, verify exclusion rules, descending order, and max 3 results with score > 0.1
    - **Validates: Requirements 9.1, 9.2, 9.4, 9.5, 9.6, 18.4**

- [x] 9. Reliability Score Service
  - [x] 9.1 Implement `reliabilityScoreService` in `functions/src/services/reliability-score.ts` with `computeScore(volunteer)`, `updateOnCompletion()`, `updateOnDecline()`, `updateOnFeedback()` methods; compute `reliability_score = (completion_rate × 0.4 + response_time_score × 0.3 + feedback_score × 0.3) × 100` clamped to [0, 100]; flag volunteer for review and exclude from high-severity dispatches when score < 30
    - Update `task_history` fields on the Volunteer document
    - _Requirements: 18.1, 18.2, 18.3, 18.5_

  - [ ]* 9.2 Write property tests for reliability score
    - **Property 15: Reliability Score Bounds and Computation** — generate random volunteer histories, verify score is always in [0, 100] and matches formula
    - **Property 16: Reliability Score Monotonicity** — generate positive events, verify score increases; generate negative events, verify score decreases
    - **Property 17: Reliability Score Threshold Enforcement** — generate scores around 30, verify flagging and exclusion behavior
    - **Validates: Requirements 18.1, 18.2, 18.3, 18.5**

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Gemini Extraction Service
  - [x] 11.1 Implement `extractionService` in `functions/src/services/extraction.ts` with `extractFromText(text, language?)`, `extractFromAudio(audioUrl)`, and `generateFollowUp(field, language)` methods; use Gemini 1.5 Flash to extract structured Need fields (`need_type`, `location`, `severity`, `affected_count`, `vulnerability_flags`) with per-field confidence scores; support English, Hindi, Punjabi; return `ExtractionResult` interface; if any field confidence < 0.7, flag for follow-up; for audio, if transcription confidence < 0.5, return error
    - _Requirements: 7.1, 7.4, 7.6, 8.1, 8.2, 8.4, 8.5_

  - [ ]* 11.2 Write unit tests for extraction service
    - Test text extraction with mock Gemini responses, confidence thresholds, follow-up generation, audio error handling
    - _Requirements: 7.1, 7.4, 8.4_

- [x] 12. WhatsApp Webhook Handler and Conversation State
  - [x] 12.1 Implement `whatsappWebhook` Cloud Function v2 (HTTPS trigger at `POST /webhook/whatsapp`) in `functions/src/functions/whatsapp-webhook.ts`; validate Twilio request signature; maintain conversation state in `conversations/{phone}` Firestore collection; route messages based on `ConversationContext.state`: idle → consent flow, collecting_need → extraction pipeline, awaiting_confirmation → YES/EDIT handling, dispatched → volunteer command handler, debrief_active → debrief pipeline
    - Implement idempotent processing using Twilio message SID
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 8.1, 8.2, 8.3, 17.1_

  - [x] 12.2 Implement consent flow within the webhook handler: when a new reporter messages, send consent explanation message; on YES, call `consentService.grantConsent()`; on NO, acknowledge and inform of alternatives; on WITHDRAW, call `consentService.revokeConsent()` and confirm
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [x] 12.3 Implement Need confirmation and editing flow: after extraction, send summary to reporter; on YES, create Need document with status "new" and trigger urgency engine; on EDIT, present numbered field list and allow corrections by number
    - _Requirements: 7.2, 7.3, 7.5_

  - [ ]* 12.4 Write unit tests for webhook handler
    - Test Twilio signature validation, conversation state routing, consent flow, confirmation/edit flow, idempotent processing
    - _Requirements: 7.1, 7.2, 7.3, 17.1_

- [x] 13. Duplicate Detection Service
  - [x] 13.1 Implement `duplicateDetectionService` in `functions/src/services/duplicate-detection.ts` with `computeEmbedding(text)`, `cosineSimilarity(a, b)`, `findDuplicates(need, ngo_id)` methods; use Gemini text-embedding-004 for embeddings; compute cosine similarity; flag as duplicate if similarity > 0.85 within 5 km radius; set `duplicate_of` field on the new Need; implement Firestore `onCreate` trigger on `needs/{needId}`
    - _Requirements: 22.1, 22.2, 22.3_

  - [ ]* 13.2 Write property test for duplicate detection
    - **Property 20: Cosine Similarity Duplicate Detection** — generate random embedding vectors, verify cosine similarity is in [-1, 1] and threshold behavior at 0.85
    - **Validates: Requirements 22.2**

- [x] 14. Dispatch Service
  - [x] 14.1 Implement `dispatchService` in `functions/src/services/dispatch.ts` with `sendDispatch()`, `handleResponse()`, `escalate()` methods; implement Firestore `onWrite` trigger on `dispatches/{dispatchId}`; send WhatsApp template messages via Twilio with need_type, location, urgency level, estimated time; handle volunteer commands: YES (assign), NO (decline + dispatch next), DONE (complete + trigger debrief), HELP (notify coordinator), AVAILABLE/BUSY (toggle status); implement 15-minute escalation timeout via Cloud Tasks
    - Create dispatch document in Firestore on coordinator action
    - Update Need status on volunteer response
    - Append audit trail entries for all state changes
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 14.2 Write unit tests for dispatch service
    - Test each volunteer command (YES/NO/DONE/HELP/AVAILABLE/BUSY), escalation logic, audit trail entries
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 15. Debrief Service
  - [x] 15.1 Implement `debriefService` in `functions/src/services/debrief.ts` with `initiateDebrief()` and `processResponse()` methods; triggered when Need status → "completed"; send follow-up WhatsApp message within 2 minutes asking about nearby needs; extract structured Need fields from debrief responses using Gemini; create new Need documents with `source: "debrief"` and `debrief_source_need_id` reference; limit to 3 follow-up questions per session; handle "nothing" responses
    - Store debrief session in `debriefs/{debriefId}` collection
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 15.2 Write property test for debrief question limit
    - **Property 8: Debrief Question Limit Invariant** — generate random debrief sessions with varying responses, verify questions_asked never exceeds 3
    - **Validates: Requirements 11.4**

- [x] 16. Beneficiary Feedback Service
  - [x] 16.1 Implement beneficiary feedback flow in `functions/src/services/beneficiary-feedback.ts`; when Need status → "completed", send WhatsApp message to original reporter asking to confirm help received; on positive confirmation, update audit trail and increase volunteer reliability score; on negative feedback, flag for coordinator review, record in audit trail, decrease reliability score; if no response within 24 hours, mark as "unverified"
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ]* 16.2 Write unit tests for beneficiary feedback
    - Test positive confirmation, negative feedback, timeout handling, reliability score updates
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 17. External Service Resilience and Health Check
  - [x] 17.1 Implement circuit breaker pattern in `functions/src/utils/circuit-breaker.ts` for Gemini and Twilio: closed (normal), open (after 5 consecutive failures in 60s — immediate queue/fallback), half-open (after 30s — test one request); implement message queue processing using `message_queue` Firestore collection with `pending_extraction` and `pending_send` statuses; implement exponential backoff retry (5s, 10s, 20s, max 3 retries) for Twilio failures; implement Firestore write retry (3 attempts with exponential backoff)
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 23.1, 23.2_

  - [x] 17.2 Implement health check Cloud Function at `GET /health` returning `HealthStatus` with Firestore, Gemini, and Twilio availability; return HTTP 200 when all healthy, HTTP 503 with degraded service breakdown; include circuit breaker states
    - _Requirements: 25.5_

  - [ ]* 17.3 Write property test for exponential backoff
    - **Property 24: Exponential Backoff Computation** — generate random retry attempt numbers 0–2, verify delay equals `5 × 2^N` seconds and max 3 retries
    - **Validates: Requirements 25.2**

- [x] 18. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Coordinator Dashboard — Core Layout, Auth, and Real-Time Data
  - [x] 19.1 Set up React 18 + Vite 5 + Tailwind CSS 3 frontend in `frontend/`; configure Firebase SDK (Auth, Firestore); implement Google SSO sign-in page; implement auth context provider that reads `role` and `ngo_id` from Firebase ID token custom claims; implement protected route wrapper that redirects unauthenticated users; implement responsive layout shell (sidebar navigation, header with user info, main content area) for screens 320px–1920px
    - _Requirements: 1.5, 2.1, 6.6_

  - [x] 19.2 Implement real-time data hooks using Firestore `onSnapshot` listeners filtered by `ngo_id` for `needs`, `dispatches`, `inventory`, `system_alerts` collections; implement service worker for offline caching of previously loaded data; implement offline action queue that syncs on reconnect with last-write-wins conflict resolution using timestamp comparison
    - _Requirements: 6.5, 23.3, 23.4_

  - [ ]* 19.3 Write property test for last-write-wins conflict resolution
    - **Property 21: Last-Write-Wins Conflict Resolution** — generate random sets of concurrent modifications with timestamps, verify the modification with the latest timestamp wins
    - **Validates: Requirements 23.4**

- [x] 20. Coordinator Dashboard — Map View and Need List
  - [x] 20.1 Implement `MapView` component using Google Maps JS API displaying open Needs as markers color-coded by urgency (red: urgency_score > 8, orange: 4–8, green: < 4); implement `NeedList` component showing ranked list sorted by urgency_score descending with need_type, location, severity, affected_count, urgency_score, and time since reported
    - _Requirements: 6.1, 6.2_

  - [x] 20.2 Implement `NeedDetail` component showing full Need details including urgency formula breakdown, audit trail as chronological timeline, assigned volunteer info; implement "Dispatch" button that invokes the Matching Engine and displays `DispatchPanel` with top-3 volunteer matches and match_score breakdowns; coordinator selects a volunteer and confirms dispatch
    - _Requirements: 6.3, 6.4_

  - [ ]* 20.3 Write property test for need list ordering
    - **Property 4: Need List Urgency Ordering** — generate random lists of Needs with urgency scores, verify the displayed list is sorted in strictly descending order
    - **Validates: Requirements 6.2**

- [x] 21. Coordinator Dashboard — Impact Dashboard and Metrics
  - [x] 21.1 Implement `ImpactDashboard` component showing: total Needs resolved, average report-to-dispatch time, average dispatch-to-completion time, active Volunteers count, volunteer-to-task skill match percentage; implement trend charts using Recharts for need volume, resolution time, and volunteer engagement over configurable periods (7d, 30d, 90d); implement CSV export of impact metrics; display warning indicator when average report-to-dispatch time exceeds 30 minutes in any 24-hour period
    - _Requirements: 20.1, 20.2, 20.3, 20.4_

  - [ ]* 21.2 Write property test for dispatch time warning
    - **Property 18: Dispatch Time Warning Threshold** — generate random sets of dispatch times for 24-hour periods, verify warning shows when average > 30 minutes and not when ≤ 30 minutes
    - **Validates: Requirements 20.3**

- [x] 22. Coordinator Dashboard — Inventory Manager
  - [x] 22.1 Implement `InventoryManager` component with CRUD operations for resource inventory (`inventory` collection); implement need_type to resource_type mapping suggestions when dispatching (food_shortage → food_kits, medical_emergency → medical_supplies); decrement inventory on dispatch and prompt for consumption confirmation on DONE; display threshold alerts when quantity drops below configured threshold
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 22.2 Write property tests for inventory
    - **Property 10: Need-Type to Resource Mapping** — generate random need_types, verify suggested resources match the defined mapping
    - **Property 11: Inventory Threshold Alerting** — generate random inventory quantities around thresholds, verify alert triggering behavior
    - **Validates: Requirements 14.2, 14.4**

- [x] 23. Coordinator Dashboard — Admin Panel
  - [x] 23.1 Implement `AdminPanel` component for user management: list users in the NGO, assign/change roles (calls `setCustomClaims` Cloud Function), manage NGO settings (overflow_enabled, overflow_partners, inventory_thresholds); only accessible to `ngo_admin` and `super_admin` roles
    - _Requirements: 4.1, 4.2, 15.1_

- [x] 24. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 25. Forecasting Engine
  - [x] 25.1 Implement `forecastingEngine` as a Cloud Run service in `functions/src/services/forecasting.ts`; train Facebook Prophet time-series model on historical Need data grouped by need_type and geographic area; schedule weekly retraining via Cloud Scheduler; produce 7-day forecasts of expected need volumes; generate early warning alerts when predicted volume exceeds historical 90th percentile; apply rule-based overrides for seasonal patterns (monsoon, festivals, extreme weather); fall back to rule-based predictions with reduced confidence when fewer than 30 data points exist; store forecasts in `forecasts/{forecastId}` and alerts in `system_alerts/{alertId}`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ]* 25.2 Write property test for early warning threshold
    - **Property 9: Early Warning Threshold Correctness** — generate random forecast predictions and 90th percentile thresholds, verify early warning is generated if and only if prediction exceeds threshold
    - **Validates: Requirements 13.3**

- [x] 26. Coordinator Dashboard — Forecast View
  - [x] 26.1 Implement `ForecastView` component displaying 7-day forecast charts (Recharts) with predicted need volumes by need_type and area; display early warning indicators from `system_alerts` collection; show confidence level (high/reduced)
    - _Requirements: 13.2, 13.3_

- [x] 27. Cross-NGO Overflow Service
  - [x] 27.1 Implement `overflowService` in `functions/src/services/overflow.ts` with `requestOverflow()`, `acceptOverflow()`, `resolveOverflow()` methods; require bilateral consent between NGOs before data exchange; share only minimal fields (need_type, general_area, severity, required_skills) — never exact location, reporter phone, consent token, or raw input; on acceptance, copy full Need details to accepting NGO's partition; on resolution, notify originating NGO and record in both audit trails; maintain complete data isolation for non-overflow Needs
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 27.2 Write property test for overflow data minimization
    - **Property 12: Overflow Data Minimization** — generate random Need documents, verify overflow requests contain only need_type, general_area, severity, required_skills and no other fields
    - **Validates: Requirements 15.2**

  - [x] 27.3 Implement `OverflowPanel` dashboard component showing incoming/outgoing overflow requests, accept/decline actions, and resolution status
    - _Requirements: 15.2, 15.3_

- [x] 28. Blog Generation Service
  - [x] 28.1 Implement `blogGenerationService` in `functions/src/services/blog-generation.ts` with `generateStory()`, `anonymizeContent()`, `publishStory()` methods; use Gemini 1.5 Flash to generate narrative impact blog posts from resolved Needs; anonymize all beneficiary data (replace phone numbers, exact addresses, names with generic descriptions); store drafts in `posts/{postId}` collection; serve published stories via Firebase Hosting public endpoint
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

  - [ ]* 28.2 Write property test for blog anonymization
    - **Property 19: Blog Content Anonymization** — generate random blog content containing PII patterns (phone numbers, addresses, names), verify anonymized output contains zero instances of personal data
    - **Validates: Requirements 21.2**

  - [x] 28.3 Implement `BlogEditor` dashboard component for reviewing AI-generated stories, editing content, and publishing; only accessible to `coordinator`, `ngo_admin`, and `super_admin` roles
    - _Requirements: 21.3, 21.4_

- [x] 29. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 30. CI/CD Pipeline
  - [x] 30.1 Create GitHub Actions workflow in `.github/workflows/ci.yml` for continuous integration: run linting (ESLint), type checking (tsc), backend unit tests (Jest), frontend unit tests (Vitest), and Firestore Security Rules tests on every pull request; create deployment workflow that deploys Cloud Functions, Firestore Security Rules, and React frontend to Firebase staging on merge to main; create production deployment workflow triggered by release tags; block deployment on any CI failure via GitHub status checks
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [x] 31. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate the 24 universal correctness properties defined in the design
- Unit tests validate specific examples and edge cases
- All code uses TypeScript; backend tested with Jest + fast-check, frontend with Vitest + fast-check
- The existing prototype code (server.js, public/index.html) is replaced in task 1.1
