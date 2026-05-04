# Security Specification: GridGuard

## 1. Data Invariants
- A `Transformer` must have a unique `serialNumber`.
- A `Transformer` cannot be registered without valid Nokia SIM location metadata.
- Status transitions are restricted based on location breach calculations and AI risk rating.
- `Alert` documents are system-generated and immutable for users.
- Only authenticated users can read transformer data.
- Only authorized users (e.g., matching the owner email if implemented, or general authenticated for this MVP) can write.

## 2. The "Dirty Dozen" Payloads
1. **Identity Spoofing**: Attempt to create a transformer with a different user's ID as owner.
2. **Shadow Field Injection**: Attempt to set `isVerified: true` manually.
3. **Ghost Update**: Attempt to update `registrationLocation` after initial setup.
4. **ID Poisoning**: Use a 2KB string as a transformer ID.
5. **State Shortcut**: Move from `GREEN` to `RED` without distance verification data.
6. **SMS Trigger Injection**: Attempt to write a malicious message into a system alert.
7. **PII Leak**: Read `phoneNumber` of a transformer you don't manage.
8. **Denial of Wallet**: Flood with 1MB strings in the `riskAnalysis` field.
9. **Orphaned Writes**: Create an alert for a non-existent transformer.
10. **Admin Escalation**: Attempt to set `isAdmin: true` on user profile.
11. **Client Timestamp Spoofing**: Provide a future date for `lastUpdated`.
12. **Blanket Query Scraping**: Attempt to list all transformers without any filters.

## 3. Test Runner
(Tests will be implemented in `firestore.rules.test.ts`)
