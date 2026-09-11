# Employee accounts

Each installation serves one organization. Each employee has an individual account linked to a team member. There is no public self-registration or shared employee password.

## Owner setup

1. Open **Team → Manage employee logins**, or **Roles & access → Employee logins** (`/admin/users`).
2. On an unconfigured local installation, save your owner password here. This enables sign-in for the whole workspace and keeps you signed in. For server installation or owner recovery, use `npm run workspace:setup` (add `--reset-password` for recovery).
3. Create a new team member or select an existing one, enter their sign-in email and select their access role. **Employee** starts with personal work only.
4. Copy the generated private setup link and share it directly with that employee. The app does not send an email. Links expire after 48 hours and work once.
5. The employee chooses a password of at least 14 characters, then signs in at `/api/auth/login` with email and password. The owner signs in with the owner password and an empty email field.
6. Assign work to the linked team member on `/tasks`. The assignment appears in that employee's `/me` dashboard. Employees can also create their own tasks, set due dates/goals and update their assigned work.

For other computers to connect, deploy behind HTTPS and set `APP_BASE_URL` to that exact origin, for example `https://business.example.org`. A localhost address works only on the computer running the app. Configure the reverse proxy to reach the local application; keep the private data directory off the public web. Login and API form submissions validate the configured origin.

## What employees see

- **My work**: their own assigned tasks, task status controls, personal task creation and deadlines.
- **Notes**: notes owned by their account. New notes are private. Legacy notes without an owner ID remain accessible to the workspace owner. Explicit team notes also require team and source-page permissions.
- **My roadmap**: their own conversations, selected readable notes, plans and progress. Two employees assigned the same access role do not share conversations or plans. Existing owner roadmaps remain with the owner.
- **My account**: name, sign-in email, assigned access role, password change and sign-out. Changing a password signs out all sessions.
- Additional shared business sections granted by the owner through **Roles & access**. A section grant applies to shared records in that section, not only records assigned to that person. The default Employee role has no access to shared sales, finances, participant records or other team members' tasks. Grant broader roles intentionally.

Employees use their personal deadlines and AI planning. Cross-department home metrics, business-tool AI and the shared company calendar remain owner tools. Shared team editing is separate from personal task editing; employee payroll fields are omitted from the shared task board and employee-facing team directory. Account administration, role changes, branding and connection secrets require the actual owner.

## Changes and recovery

- **Role** changes take effect on the next request. A role cookie cannot change an employee's assigned permissions. The owner alone can preview another role.
- **Disable login** invalidates all sessions and setup links immediately. It retains the employee's work. Enabling again requires a new setup link and password.
- **Reset password** revokes sessions, invalidates the current password and replaces any existing setup link. The employee must use the new link.
- **Edit account details** changes name/email. Changing the sign-in email invalidates sessions and requires a new setup link.
- Removing a linked team member through the owner interface disables its login. Keep the member if its work history must remain easy to assign and review.
- Password recovery is owner-assisted. No password can be read back from storage. Session tokens and setup tokens are hashed; sessions expire after 12 hours. Repeated failed sign-ins are throttled persistently.

Back up the entire private `DEALDESK_DATA_DIR`, including SQLite, the team roster, permission settings and encrypted owner vault. Never copy that directory into a source release. Owner CLI password rotation revokes owner sessions; disable or reset employee accounts separately when required.

## Published shifts and attendance

Managers use **Team → Staff scheduling & shifts** to assign and publish shifts. Employees see only their own published schedule in **My work**, acknowledge it, record actual clock-in/out and unpaid breaks, and request time away. Managers must resolve conflicting assignments before approving leave. Corrections require evidence and retain the original attendance in audit history. See [restaurant and staff operations](RESTAURANT.md).

## Verification and limits

`npm test` includes employee identity, role forgery, immediate role updates, invitation reuse/expiry, password/session revocation, private note/roadmap access and assignment checks. `npm run workspace:smoke` creates and activates two employees against a disposable production server, signs in, verifies personal data and task completion, tests restricted API denial and disables an active login, then cleans up.

This is local account authentication, not an SSO/MFA deployment. Automatic invitation email, independent security certification, load certification and a hosted public deployment are separate work. Visual interaction verification still requires the configured native testing MCP connection to be restored.


Assigned vehicle inspections also appear in **My work**. Only the assigned active employee can record their checklist, measurements, photos and timed work. Management, cost review and customer sharing require Services edit permission. See [inspection and technician setup](AUTO-REPAIR-INSPECTIONS.md).
