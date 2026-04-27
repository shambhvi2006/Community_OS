# Requirements Document

## Introduction

CommunityOS is an agentic AI coordination platform that transforms how NGOs coordinate volunteer responses to community needs. The platform evolves from an existing Express/Gemini chat prototype into a production-grade, multi-tenant system built on Firebase, featuring WhatsApp-based data collection, intelligent volunteer matching, predictive forecasting, and cross-NGO collaboration. The architecture follows a three-layer model: Ingestion (WhatsApp, voice, web), Intelligence (urgency scoring, matching, forecasting), and Action & Feedback (dispatch, debrief, audit). The existing codebase — an Express server with in-memory sessions, hardcoded volunteer opportunity data, and a WhatsApp-style chat UI powered by Gemini — is a prototype with no database persistence, no authentication, and no Twilio integration. All existing code is to be replaced (not extended) by the production Firebase-backed system. The target Firebase project is deployed in the asia-south1 region.

## Glossary

- **Platform**: The CommunityOS core system encompassing all backend services, Cloud Functions, Firestore database, and Firebase Hosting frontend
- **Coordinator_Dashboard**: The React-based web interface used by NGO coordinators to view, triage, and manage community needs on a map with ranked lists
- **WhatsApp_Bot**: The Twilio-integrated WhatsApp messaging interface that receives community need reports and interacts with volunteers via text and voice
- **Urgency_Engine**: The scoring module that computes urgency_score for each Need using the transparent formula: (severity × affected_count × vulnerability_multiplier) / hours_since_reported
- **Matching_Engine**: The module that computes match_score for volunteer-to-task assignment using: skill_match × (1 / (distance_km + 1)) × availability_score × (1 / burnout_factor)
- **Need**: A community need object stored in Firestore containing source, location, need_type, severity, affected_count, vulnerability_flags, urgency_score, status, and audit trail
- **Volunteer**: A registered user who accepts and fulfills community tasks, with a profile containing skills, location, availability, reliability_score, and burnout_factor
- **Coordinator**: An NGO staff member who triages needs, dispatches volunteers, and monitors operations via the Coordinator_Dashboard
- **Admin**: An NGO administrator who manages organization settings, user roles, and cross-NGO collaboration agreements
- **Tenant**: A single NGO organization whose data is logically isolated in Firestore by ngo_id
- **Dispatch_Service**: The Cloud Function that sends WhatsApp template messages to matched volunteers and manages the acceptance/escalation flow
- **Debrief_Service**: The Cloud Function that prompts volunteers for post-task feedback and captures new community intelligence
- **Forecasting_Engine**: The Prophet-based time-series module that predicts future need volumes and generates early warnings
- **Overflow_Service**: The module that enables bilateral cross-NGO need sharing when one NGO lacks capacity
- **Audit_Trail**: An immutable, append-only log of all actions taken on a Need from creation through resolution
- **Consent_Token**: A cryptographic token representing explicit consent from a beneficiary for data collection and processing
- **Reliability_Score**: A composite score (0–100) reflecting a volunteer's task completion rate, timeliness, and feedback quality
- **Vulnerability_Multiplier**: A numeric factor applied to urgency scoring based on affected population flags (children 1.4, elderly 1.3, pregnant 1.4, disabled 1.2, medical_emergency 1.6), stacking additively with a cap of 2.0
- **Escalation**: The automatic reassignment process triggered when a dispatched volunteer does not respond within 15 minutes
- **RBAC**: Role-Based Access Control with four roles — super_admin, ngo_admin, coordinator, volunteer — enforced via Firebase Auth custom claims

## Cross-Cutting Constraints

1. All existing prototype code (server.js, public/index.html, communityos_whatsapp.html) SHALL be replaced by the production Firebase-backed system, not extended or refactored incrementally.
2. The target Firebase project SHALL be configured in the asia-south1 region for all services (Firestore, Cloud Functions, Hosting, Auth).
3. For every requirement involving Gemini API, Twilio API, or Firebase service calls, the implementation SHALL include explicit error handling with defined fallback behavior when the external service is unavailable.
4. Each requirement's implementation SHALL include at least one unit test covering the core acceptance criterion.

## Requirements

### Requirement 1: Firebase Project Infrastructure and Firestore Schema

**User Story:** As a developer, I want the platform migrated from the in-memory Express prototype to a Firebase-backed architecture with Cloud Firestore, so that data persists reliably and the system can scale to multiple NGOs.

#### Acceptance Criteria

1. THE Platform SHALL store all application data in Cloud Firestore using native-mode with logical multi-tenancy partitioned by ngo_id
2. WHEN a Need is created, THE Platform SHALL persist a Need document containing all canonical fields: id, source, location, need_type, severity, affected_count, vulnerability_flags, urgency_score, status, assigned_volunteer_id, created_at, updated_at, raw_input, language, ngo_id, consent_token, duplicate_of, recurrence_group_id, and audit_trail_id
3. WHEN a Volunteer registers, THE Platform SHALL persist a Volunteer document containing: id, name, phone, location, skills, availability, ngo_id, reliability_score, burnout_factor, status, and created_at
4. THE Platform SHALL deploy backend logic as Firebase Cloud Functions v2 triggered by Firestore document writes and HTTPS endpoints
5. THE Platform SHALL serve the React frontend via Firebase Hosting with automatic SSL

### Requirement 2: Firebase Authentication and Google SSO

**User Story:** As a user, I want to sign in securely using Google SSO, so that I can access the platform without managing separate credentials.

#### Acceptance Criteria

1. THE Platform SHALL authenticate users via Firebase Auth with Google SSO as the primary sign-in method
2. WHEN a user signs in for the first time, THE Platform SHALL create a user profile document in Firestore linked to the Firebase Auth UID
3. WHEN a user signs in, THE Platform SHALL issue a Firebase ID token containing custom claims for role and ngo_id
4. IF a user attempts to access a resource without a valid Firebase ID token, THEN THE Platform SHALL return HTTP 401 and deny access

### Requirement 3: Multi-Tenant NGO Isolation

**User Story:** As an NGO administrator, I want my organization's data completely isolated from other NGOs, so that beneficiary and operational data remains private.

#### Acceptance Criteria

1. THE Platform SHALL partition all Firestore collections by ngo_id so that queries from one Tenant return only that Tenant's documents
2. THE Platform SHALL enforce Firestore Security Rules that prevent any user from reading or writing documents belonging to a different ngo_id than their own custom claim
3. WHEN a Cloud Function processes a request, THE Platform SHALL validate that the requesting user's ngo_id custom claim matches the target document's ngo_id before performing any read or write operation
4. IF a user attempts to access a document belonging to a different Tenant, THEN THE Platform SHALL reject the request with HTTP 403

### Requirement 4: Role-Based Access Control

**User Story:** As an NGO administrator, I want to assign roles to users (super_admin, ngo_admin, coordinator, volunteer), so that each person can only perform actions appropriate to their role.

#### Acceptance Criteria

1. THE Platform SHALL support four RBAC roles: super_admin, ngo_admin, coordinator, and volunteer, stored as Firebase Auth custom claims
2. WHEN an ngo_admin assigns a role to a user, THE Platform SHALL update that user's Firebase Auth custom claims and persist the role in the user's Firestore profile
3. THE Platform SHALL enforce role-based permissions on all API endpoints: super_admin has cross-NGO access, ngo_admin manages their Tenant's settings and users, coordinator manages needs and dispatches volunteers, volunteer views assigned tasks and submits status updates
4. IF a user attempts an action not permitted by their role, THEN THE Platform SHALL reject the request with HTTP 403 and log the unauthorized attempt
5. WHILE a user's role is set to volunteer, THE Platform SHALL restrict that user to viewing only their own assigned tasks, submitting status commands (YES, NO, DONE, HELP, AVAILABLE, BUSY), and updating their own profile


### Requirement 5: Urgency Engine with Transparent Formula

**User Story:** As a coordinator, I want every community need scored by a transparent urgency formula, so that I can prioritize the most critical needs without relying on opaque AI decisions.

#### Acceptance Criteria

1. WHEN a Need document is created or updated in Firestore, THE Urgency_Engine SHALL compute urgency_score using the formula: (severity × affected_count × vulnerability_multiplier) / hours_since_reported
2. THE Urgency_Engine SHALL compute vulnerability_multiplier by summing applicable flags (children: 1.4, elderly: 1.3, pregnant: 1.4, disabled: 1.2, medical_emergency: 1.6) and capping the total at 2.0
3. WHEN the urgency_score is computed, THE Urgency_Engine SHALL store the complete formula breakdown (severity, affected_count, vulnerability_multiplier, hours_since_reported, and final score) alongside the Need document so that coordinators can inspect the calculation
4. THE Urgency_Engine SHALL recompute urgency_score for all open Needs every 15 minutes to reflect the increasing hours_since_reported decay factor
5. IF severity or affected_count is missing from a Need, THEN THE Urgency_Engine SHALL assign default values (severity: 3, affected_count: 1) and flag the Need for coordinator review

### Requirement 6: Coordinator Dashboard with Map and Ranked List

**User Story:** As a coordinator, I want a web dashboard showing community needs on a map and in a ranked list sorted by urgency, so that I can quickly identify and respond to the most critical situations.

#### Acceptance Criteria

1. THE Coordinator_Dashboard SHALL display all open Needs for the coordinator's Tenant on a Google Maps interface with markers color-coded by urgency level (red for urgency_score above 8, orange for 4–8, green for below 4)
2. THE Coordinator_Dashboard SHALL display a ranked list of open Needs sorted by urgency_score in descending order, showing need_type, location, severity, affected_count, urgency_score, and time since reported
3. WHEN a coordinator clicks a Need marker or list item, THE Coordinator_Dashboard SHALL display the full Need details including the urgency formula breakdown, audit trail, and assigned volunteer information
4. WHEN a coordinator clicks "Dispatch" on a Need, THE Coordinator_Dashboard SHALL invoke the Matching_Engine to find the top-3 matching volunteers and present them with match_score breakdowns
5. THE Coordinator_Dashboard SHALL update in real-time via Firestore onSnapshot listeners so that new Needs and status changes appear without page refresh
6. THE Coordinator_Dashboard SHALL be built with React 18, Vite 5, and Tailwind CSS 3, and render responsively on screens from 320px to 1920px width

### Requirement 7: WhatsApp Text Bot for Need Collection

**User Story:** As a community member or field worker, I want to report community needs via WhatsApp text messages, so that I can submit reports from any phone without installing an app.

#### Acceptance Criteria

1. WHEN a WhatsApp message is received via the Twilio webhook, THE WhatsApp_Bot SHALL parse the message and extract structured fields (need_type, location, severity indicators, affected_count, vulnerability_flags) using Gemini 1.5 Flash
2. WHEN the WhatsApp_Bot extracts structured data from a message, THE WhatsApp_Bot SHALL send a confirmation message back to the sender summarizing the extracted fields and asking for confirmation (YES to confirm, EDIT to modify)
3. WHEN the sender confirms with YES, THE WhatsApp_Bot SHALL create a Need document in Firestore with status "new" and trigger the Urgency_Engine
4. IF the Gemini extraction confidence is below 0.7 for any field, THEN THE WhatsApp_Bot SHALL ask a targeted follow-up question for that specific field rather than guessing
5. WHEN the sender replies with EDIT, THE WhatsApp_Bot SHALL present the extracted fields as a numbered list and allow the sender to correct specific fields by number
6. THE WhatsApp_Bot SHALL support messages in English, Hindi, and Punjabi, detecting language automatically and responding in the same language


### Requirement 8: Voice Note Processing

**User Story:** As a field worker with limited literacy or time, I want to report community needs by sending a WhatsApp voice note, so that I can submit reports hands-free in my local language.

#### Acceptance Criteria

1. WHEN a WhatsApp voice note is received via the Twilio webhook, THE WhatsApp_Bot SHALL transcribe the audio using Gemini 1.5 Flash multimodal capabilities
2. WHEN the transcription is complete, THE WhatsApp_Bot SHALL extract structured Need fields from the transcript using the same extraction pipeline as text messages
3. WHEN extraction is complete, THE WhatsApp_Bot SHALL send a text confirmation summarizing the extracted fields and follow the same confirmation flow (YES/EDIT) as text-based reports
4. IF the audio quality is too low for reliable transcription (confidence below 0.5), THEN THE WhatsApp_Bot SHALL ask the sender to resend the voice note or type the report instead
5. THE WhatsApp_Bot SHALL process voice notes in English, Hindi, and Punjabi

### Requirement 9: Volunteer Matching Engine

**User Story:** As a coordinator, I want volunteers matched to needs using a transparent formula considering skills, distance, availability, and burnout, so that the best-suited and freshest volunteers are dispatched.

#### Acceptance Criteria

1. WHEN the Matching_Engine is invoked for a Need, THE Matching_Engine SHALL compute match_score for each available Volunteer in the Tenant using the formula: skill_match × (1 / (distance_km + 1)) × availability_score × (1 / burnout_factor)
2. THE Matching_Engine SHALL compute skill_match as the ratio of matching skills between the Need's required skills and the Volunteer's skill set (0.0 to 1.0)
3. THE Matching_Engine SHALL compute distance_km using the haversine formula between the Need's location coordinates and the Volunteer's registered location coordinates
4. THE Matching_Engine SHALL compute availability_score as 1.0 if the Volunteer's availability window includes the current time, 0.5 if within the next 4 hours, and 0.0 otherwise
5. THE Matching_Engine SHALL return the top-3 ranked Volunteers with the complete formula breakdown (skill_match, distance_km, availability_score, burnout_factor, and final match_score) for each
6. THE Matching_Engine SHALL exclude Volunteers whose status is "busy", whose burnout_factor exceeds 5.0, or who have declined the same Need previously
7. IF fewer than 3 Volunteers match with a match_score above 0.1, THEN THE Matching_Engine SHALL flag the Need for cross-NGO overflow consideration

### Requirement 10: WhatsApp Volunteer Dispatch and Response

**User Story:** As a volunteer, I want to receive task assignments via WhatsApp and respond with simple commands, so that I can accept, decline, complete, or request help without using a web app.

#### Acceptance Criteria

1. WHEN a coordinator dispatches a Volunteer to a Need, THE Dispatch_Service SHALL send a WhatsApp template message via Twilio containing the need_type, location, urgency level, and estimated time commitment
2. WHEN a Volunteer replies YES, THE Dispatch_Service SHALL update the Need status to "assigned", set assigned_volunteer_id, and confirm the assignment to both the Volunteer and the Coordinator
3. WHEN a Volunteer replies NO, THE Dispatch_Service SHALL record the decline, remove the Volunteer from consideration for that Need, and automatically dispatch to the next-ranked Volunteer from the Matching_Engine results
4. WHEN a Volunteer replies DONE, THE Dispatch_Service SHALL update the Need status to "completed", record the completion timestamp, and trigger the Debrief_Service
5. WHEN a Volunteer replies HELP, THE Dispatch_Service SHALL notify the assigned Coordinator immediately via WhatsApp and the Coordinator_Dashboard with the Volunteer's location and the Need details
6. IF a dispatched Volunteer does not respond within 15 minutes, THEN THE Dispatch_Service SHALL escalate by dispatching to the next-ranked Volunteer and notifying the Coordinator of the Escalation
7. THE Dispatch_Service SHALL support the AVAILABLE and BUSY commands to let Volunteers toggle their availability status


### Requirement 11: AI Debrief Loop

**User Story:** As an NGO, I want volunteers automatically prompted for a debrief after completing a task, so that new community intelligence is captured and fed back into the system.

#### Acceptance Criteria

1. WHEN a Volunteer sends DONE for a Need, THE Debrief_Service SHALL send a follow-up WhatsApp message within 2 minutes asking: "Did you notice any other community needs nearby while you were there?"
2. WHEN the Volunteer replies with debrief information, THE Debrief_Service SHALL extract structured Need fields from the response using Gemini 1.5 Flash and create new Need documents in Firestore with source set to "debrief"
3. WHEN the Volunteer replies with "nothing" or equivalent negative response, THE Debrief_Service SHALL acknowledge the response and close the debrief conversation
4. THE Debrief_Service SHALL ask a maximum of 3 follow-up questions per debrief session to avoid volunteer fatigue
5. WHEN a debrief generates new Needs, THE Debrief_Service SHALL link the new Needs to the original completed Need via a reference field for traceability

### Requirement 12: Beneficiary Feedback Loop

**User Story:** As an NGO, I want beneficiaries to verify that help was received and rate the experience, so that the system can validate task completion and improve volunteer reliability scores.

#### Acceptance Criteria

1. WHEN a Need status changes to "completed", THE Platform SHALL send a WhatsApp message to the original reporter (if phone number is available) asking to confirm that help was received
2. WHEN the beneficiary confirms receipt, THE Platform SHALL record the verification in the Need's Audit_Trail and update the Volunteer's Reliability_Score positively
3. WHEN the beneficiary reports that help was not received or was inadequate, THE Platform SHALL flag the Need for coordinator review, record the feedback in the Audit_Trail, and adjust the Volunteer's Reliability_Score accordingly
4. IF the beneficiary does not respond within 24 hours, THEN THE Platform SHALL mark the feedback as "unverified" and rely on the Volunteer's DONE report as the primary completion signal

### Requirement 13: Predictive Forecasting Engine

**User Story:** As a coordinator, I want the system to predict future need volumes and generate early warnings, so that I can pre-position volunteers and resources before crises escalate.

#### Acceptance Criteria

1. THE Forecasting_Engine SHALL train a Facebook Prophet time-series model on historical Need data grouped by need_type and geographic area, retraining weekly
2. WHEN the Forecasting_Engine generates a prediction, THE Forecasting_Engine SHALL produce a 7-day forecast of expected need volumes by need_type and area
3. WHEN the predicted need volume for any need_type in any area exceeds the historical 90th percentile, THE Forecasting_Engine SHALL generate an early warning alert visible on the Coordinator_Dashboard
4. THE Forecasting_Engine SHALL apply rule-based overrides for known seasonal patterns (monsoon flooding, festival periods, extreme weather alerts) that augment the statistical forecast
5. IF fewer than 30 historical data points exist for a need_type and area combination, THEN THE Forecasting_Engine SHALL fall back to rule-based predictions only and indicate reduced confidence

### Requirement 14: Resource Inventory Management

**User Story:** As a coordinator, I want to track physical resources (food kits, medical supplies, blankets) alongside volunteer availability, so that I can dispatch both people and materials together.

#### Acceptance Criteria

1. THE Platform SHALL maintain a resource inventory collection in Firestore with fields: id, resource_type, quantity, location, ngo_id, expiry_date, and status
2. WHEN a coordinator creates a dispatch for a Need, THE Platform SHALL suggest relevant resources from inventory based on need_type mapping (food_shortage → food_kits, medical_emergency → medical_supplies)
3. WHEN resources are dispatched with a Volunteer, THE Platform SHALL decrement the inventory quantity and record the allocation in the Need's Audit_Trail
4. WHEN inventory for any resource_type drops below a configurable threshold, THE Platform SHALL alert the Coordinator via the Coordinator_Dashboard and optionally via WhatsApp
5. WHEN a Volunteer reports DONE, THE Platform SHALL prompt for resource consumption confirmation to reconcile actual usage against allocated quantities


### Requirement 15: Cross-NGO Overflow and Collaboration

**User Story:** As an NGO administrator, I want to share overflow needs with partner NGOs when my organization lacks capacity, so that community needs are met even when one NGO is stretched thin.

#### Acceptance Criteria

1. WHEN an ngo_admin enables cross-NGO collaboration, THE Overflow_Service SHALL require bilateral consent — both the sharing NGO and the receiving NGO must explicitly agree before any data is exchanged
2. WHEN a Need is flagged for overflow (fewer than 3 matching Volunteers with match_score above 0.1), THE Overflow_Service SHALL present the Need to consented partner NGOs with only the fields necessary for matching: need_type, general area (not exact location), severity, and required skills
3. WHEN a partner NGO accepts an overflow Need, THE Overflow_Service SHALL share the full Need details with the accepting NGO and transfer coordination responsibility
4. THE Overflow_Service SHALL maintain complete data isolation between NGOs for all non-overflow Needs — shared Needs are copied to the accepting NGO's partition, not cross-referenced
5. WHEN an overflow Need is resolved, THE Overflow_Service SHALL notify the originating NGO and record the cross-NGO collaboration in both organizations' Audit_Trails

### Requirement 16: Proof-of-Life Audit Trail

**User Story:** As an NGO administrator, I want an immutable audit trail for every action taken on a community need, so that the organization can demonstrate accountability and transparency to donors and regulators.

#### Acceptance Criteria

1. THE Platform SHALL create an Audit_Trail document for each Need at creation time and append an entry for every state change (new → triaged → assigned → in_progress → completed → verified)
2. WHEN any action is performed on a Need (status change, volunteer assignment, escalation, resource allocation, debrief), THE Platform SHALL append an audit entry containing: timestamp, actor_id, actor_role, action_type, previous_value, new_value, and source (web, whatsapp, system)
3. THE Platform SHALL store Audit_Trail entries in an append-only subcollection that Firestore Security Rules prevent from being updated or deleted by any role including super_admin
4. WHEN a coordinator or admin views a Need, THE Coordinator_Dashboard SHALL display the complete Audit_Trail as a chronological timeline

### Requirement 17: Consent Framework

**User Story:** As an NGO, I want explicit consent captured before collecting or processing beneficiary data, so that the platform complies with data protection principles and respects human dignity.

#### Acceptance Criteria

1. WHEN the WhatsApp_Bot initiates a data collection conversation with a new reporter, THE WhatsApp_Bot SHALL send a consent message explaining what data will be collected, how it will be used, and how to withdraw consent, before collecting any information
2. WHEN the reporter provides consent, THE Platform SHALL generate a Consent_Token linked to the reporter's phone number and store it with the Need document
3. IF the reporter declines consent, THEN THE WhatsApp_Bot SHALL acknowledge the decision, not collect any data, and inform the reporter of alternative ways to report needs (anonymous hotline, web form)
4. WHEN a reporter sends "WITHDRAW" at any time, THE Platform SHALL revoke the Consent_Token, anonymize the reporter's personal data in all associated Need documents, and confirm the withdrawal via WhatsApp
5. THE Platform SHALL not process or share any beneficiary data that lacks a valid Consent_Token

### Requirement 18: Volunteer Reliability Score

**User Story:** As a coordinator, I want each volunteer scored on reliability based on their track record, so that the matching engine can prioritize dependable volunteers for critical tasks.

#### Acceptance Criteria

1. THE Platform SHALL compute Reliability_Score (0–100) for each Volunteer based on: task completion rate (weight 0.4), average response time to dispatch (weight 0.3), and beneficiary feedback rating (weight 0.3)
2. WHEN a Volunteer completes a task (DONE confirmed by beneficiary), THE Platform SHALL increase the Volunteer's Reliability_Score according to the weighted formula
3. WHEN a Volunteer declines a task (NO), misses the 15-minute response window, or receives negative beneficiary feedback, THE Platform SHALL decrease the Volunteer's Reliability_Score according to the weighted formula
4. THE Matching_Engine SHALL factor Reliability_Score into volunteer ranking by using it as a multiplier on the base match_score for Needs with severity above 7
5. WHEN a Volunteer's Reliability_Score drops below 30, THE Platform SHALL flag the Volunteer for coordinator review and exclude the Volunteer from high-severity dispatches until reviewed


### Requirement 19: CI/CD Pipeline

**User Story:** As a developer, I want automated build, test, and deployment pipelines, so that code changes are validated and deployed to Firebase reliably.

#### Acceptance Criteria

1. THE Platform SHALL use GitHub Actions for continuous integration, running linting, type checking, and unit tests on every pull request
2. WHEN a pull request is merged to the main branch, THE Platform SHALL automatically deploy Cloud Functions, Firestore Security Rules, and the React frontend to the Firebase staging environment
3. WHEN a release tag is created, THE Platform SHALL deploy to the Firebase production environment after all CI checks pass
4. THE Platform SHALL run Firestore Security Rules unit tests as part of the CI pipeline to validate tenant isolation and RBAC enforcement
5. IF any CI check fails, THEN THE Platform SHALL block the deployment and notify the development team via GitHub status checks

### Requirement 20: Operational Impact Dashboard

**User Story:** As an NGO administrator, I want a dashboard showing key operational metrics, so that I can measure the platform's impact and report to stakeholders.

#### Acceptance Criteria

1. THE Coordinator_Dashboard SHALL display an impact summary showing: total Needs resolved, average time from report to dispatch, average time from dispatch to completion, active Volunteers count, and volunteer-to-task skill match percentage
2. THE Coordinator_Dashboard SHALL display trend charts for need volume, resolution time, and volunteer engagement over configurable time periods (7 days, 30 days, 90 days)
3. WHEN the average time from report to dispatch exceeds 30 minutes for any 24-hour period, THE Coordinator_Dashboard SHALL display a warning indicator on the impact summary
4. THE Coordinator_Dashboard SHALL allow export of impact metrics as CSV for donor reporting

### Requirement 21: NGO Impact Blog Generation

**User Story:** As an NGO, I want the system to auto-generate impact stories from resolved needs data, so that the organization can share success stories with donors and the community with minimal effort.

#### Acceptance Criteria

1. WHEN a coordinator selects resolved Needs for story generation, THE Platform SHALL use Gemini 1.5 Flash to generate a narrative impact blog post summarizing the needs, volunteer response, and outcomes
2. THE Platform SHALL anonymize all beneficiary data in generated stories, replacing personal details with generic descriptions
3. WHEN a story is generated, THE Platform SHALL present it to the coordinator for review and editing before publication
4. THE Platform SHALL store approved stories in Firestore and make them available via a public-facing blog endpoint on Firebase Hosting

### Requirement 22: Duplicate Need Detection

**User Story:** As a coordinator, I want the system to detect when the same community need is reported multiple times, so that duplicate efforts are avoided and resources are not wasted.

#### Acceptance Criteria

1. WHEN a new Need is created, THE Platform SHALL compute a text embedding of the Need description using Gemini text-embedding-004 and compare it against embeddings of open Needs within the same geographic area (5 km radius)
2. WHEN the cosine similarity between a new Need embedding and an existing open Need embedding exceeds 0.85, THE Platform SHALL flag the new Need as a potential duplicate and link it to the existing Need via the duplicate_of field
3. WHEN a potential duplicate is detected, THE Platform SHALL notify the coordinator via the Coordinator_Dashboard and present both Needs side-by-side for manual confirmation
4. IF the coordinator confirms the duplicate, THEN THE Platform SHALL merge the Needs by incrementing the affected_count on the original Need and archiving the duplicate
5. IF the coordinator rejects the duplicate flag, THEN THE Platform SHALL clear the duplicate_of field and process the Need independently

### Requirement 23: Degraded Connectivity Support

**User Story:** As a field worker operating in areas with poor network coverage, I want the platform to function reliably on 2G connections and handle intermittent connectivity, so that community needs can still be reported and processed.

#### Acceptance Criteria

1. THE WhatsApp_Bot SHALL process incoming messages asynchronously and respond within 30 seconds even on 2G network conditions by keeping response payloads under 1 KB of text
2. WHEN the WhatsApp_Bot receives a message but cannot reach the Gemini API, THE WhatsApp_Bot SHALL queue the message in Firestore for processing when connectivity is restored and send an acknowledgment to the sender: "Message received, processing shortly"
3. THE Coordinator_Dashboard SHALL implement service worker caching so that previously loaded Need data remains viewable when the browser loses connectivity
4. WHEN the Coordinator_Dashboard regains connectivity, THE Coordinator_Dashboard SHALL sync any offline actions (status changes, notes) to Firestore and resolve conflicts using last-write-wins with timestamp comparison

### Requirement 24: Urgency Score Serialization and Display

**User Story:** As a developer, I want urgency score calculations serialized to and parsed from a standard JSON format, so that scores can be transmitted between services, stored, and displayed consistently.

#### Acceptance Criteria

1. THE Urgency_Engine SHALL serialize urgency score breakdowns to JSON format containing fields: severity, affected_count, vulnerability_flags (array), vulnerability_multiplier, hours_since_reported, urgency_score, and computed_at timestamp
2. THE Urgency_Engine SHALL parse urgency score JSON back into the internal computation model and recompute the score to verify consistency
3. THE Urgency_Engine SHALL format urgency score breakdowns into a human-readable string for display on the Coordinator_Dashboard and in WhatsApp messages
4. FOR ALL valid urgency score objects, serializing to JSON then parsing back then serializing again SHALL produce identical JSON output (round-trip property)

### Requirement 25: External Service Resilience

**User Story:** As a platform operator, I want the system to handle failures from Gemini, Twilio, and Firebase gracefully, so that partial outages do not cause data loss or leave users without feedback.

#### Acceptance Criteria

1. IF the Gemini API is unavailable or returns an error, THEN THE WhatsApp_Bot SHALL queue the unprocessed message in Firestore with status "pending_extraction" and send an acknowledgment to the sender indicating the message was received and will be processed shortly
2. IF the Twilio API is unavailable when sending a dispatch or notification message, THEN THE Dispatch_Service SHALL queue the message in Firestore with status "pending_send" and retry with exponential backoff (initial delay 5 seconds, maximum 3 retries)
3. IF a Firestore write operation fails, THEN THE Platform SHALL retry the operation up to 3 times with exponential backoff and log the failure with full context (document path, payload, error) for manual recovery
4. WHEN a queued message is successfully processed after a service recovery, THE Platform SHALL resume the normal workflow from the point of interruption without requiring user re-submission
5. THE Platform SHALL expose a health check endpoint that reports the availability status of Gemini API, Twilio API, and Firestore connectivity, returning HTTP 200 when all services are reachable and HTTP 503 with a breakdown of which services are degraded
