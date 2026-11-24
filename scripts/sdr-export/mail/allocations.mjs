import { HttpError, text } from '../../../sales/model.mjs';
import { sameAddress } from './zoho-account.mjs';

const statuses = {
  ready: 'Assigned',
  pending: 'Needs Zoho mailbox access',
  creating: 'Creating in Zoho',
  check: 'Check in Zoho',
  failed: 'Creation declined',
  released: 'Unassigned',
};
const activeOperation = (row) => row?.status === 'creating' && Date.now() - Date.parse(row.updated_at) < 60000;
const publicAllocation = (row) =>
  row && { address: row.address, status: row.status, label: statuses[row.status], revision: row.revision };
const forbidden = () => new HttpError(403, 'Only the workspace owner can manage rep mailboxes.');

export function mailboxAllocations({ db, roster, config, organization, accountFor, mailAddress }) {
  const store = db.repMail;
  const actions = ['rep-email-allocations', 'rep-email-bind', 'rep-email-provision', 'rep-email-release'];
  function member(id) {
    const rep = roster.rosterUser(db.get('agents', id));
    if (!rep) throw new HttpError(404, 'Choose an active Tinky Team agent.');
    return rep;
  }
  function available(id, address, company) {
    const holder = store.allocationByAddress(address);
    if (
      sameAddress(address, company.ownerAddress) ||
      (holder && holder.member_id !== id) ||
      Object.entries(company.mailboxes).some(([other, box]) => other !== id && sameAddress(box?.address, address))
    ) {
      throw new HttpError(409, 'That mailbox is reserved for another workspace member.');
    }
    const other = db
      .list('agents')
      .find((row) => String(row.id) !== id && sameAddress(row.contact_email, address) && roster.rosterUser(row));
    if (other && sameAddress(accountFor(roster.rosterUser(other)).address, address))
      throw new HttpError(409, 'Another active rep already uses that business address.');
  }
  function preflight(id, body, company, address) {
    const rep = member(id),
      current = store.allocation(id);
    if (!Number.isSafeInteger(body.revision) || body.revision !== (current?.revision || 0))
      throw new HttpError(409, 'The mailbox assignment changed. Refresh Senders.');
    if (activeOperation(current)) throw new HttpError(409, 'Zoho mailbox creation is in progress.');
    if (address) available(id, address, company);
    return { rep, current };
  }
  async function dispatch(user, action, body) {
    if (user.role !== 'owner') throw forbidden();
    const company = config();
    if (action === 'rep-email-allocations') {
      const offset = body.offset ?? 0;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
        throw new HttpError(400, 'Reload the Zoho directory.');
      const members = roster
        .messagingMembers()
        .filter((entry) => entry.id !== 'owner')
        .map((entry) => {
          const rep = member(entry.id),
            box = accountFor(rep);
          return {
            ...entry,
            login: rep.email,
            mailbox: publicAllocation(store.allocation(rep.id)) || {
              address: box.address,
              status: 'automatic',
              label: 'Sign-in address',
              revision: 0,
            },
          };
        });
      const assigned = store
        .allocations()
        .filter((row) => row.address)
        .map((row) => ({ memberId: row.member_id, ...publicAllocation(row) }));
      const local = { members, assigned, ownerAddress: company.ownerAddress, accounts: [], domains: [], next: null };
      try {
        const org = await organization.context(company);
        const [page, domains] = await Promise.all([org.list(offset), org.domains()]);
        return {
          ...local,
          accounts: page.accounts.map(({ address, name }) => ({ address, name })),
          domains,
          next: page.next,
        };
      } catch {
        return {
          ...local,
          directoryError:
            'Zoho could not load the organization directory. Check the company client’s organization permissions and refresh.',
        };
      }
    }
    const id = text(body.memberId, 80, true);
    if (id === 'owner') throw new HttpError(409, 'The workspace owner’s mailbox is reserved.');
    if (action === 'rep-email-release') {
      return store.transaction(() => {
        const current = store.allocation(id);
        if (!current && !db.get('agents', id)) throw new HttpError(404, 'Mailbox assignment not found.');
        if ((current?.revision || 0) !== body.revision || activeOperation(current))
          throw new HttpError(409, 'Refresh the current mailbox assignment.');
        return { mailbox: publicAllocation(store.setAllocation(id, body.revision, '', '', '', 'released')) };
      });
    }
    const address = mailAddress(body.address);
    const { rep, current } = preflight(id, body, company, address);
    const creating = action === 'rep-email-provision';
    if (creating && current?.address && current.status !== 'failed')
      throw new HttpError(409, 'Check the existing assignment or release it before creating another mailbox.');
    const org = await organization.context(company);
    let revision = body.revision;
    if (creating) {
      const password = body.password ?? '';
      if (typeof password !== 'string' || password.length > 256 || /[\x00-\x1f\x7f]/.test(password))
        throw new HttpError(400, 'Enter a valid initial Zoho password or leave it blank to generate one.');
      const domains = await org.domains();
      if (!domains.includes(address.split('@')[1]))
        throw new HttpError(400, 'Choose a verified Zoho mail domain for this company.');
      revision = store.transaction(() => {
        preflight(id, body, config(), address);
        return store.setAllocation(id, body.revision, address, '', org.orgId, 'creating').revision;
      });
      try {
        await org.create(address, rep.name, password);
      } catch (error) {
        const definite = [400, 401, 403, 404, 409, 422].includes(error.providerStatus);
        store.setAllocation(id, revision, address, '', org.orgId, definite ? 'failed' : 'check');
        throw new HttpError(
          definite ? 422 : 502,
          definite
            ? 'Zoho declined creation. Check whether the address already exists, the password policy, and available licenses.'
            : 'Zoho did not confirm creation. Use Check access before trying again.'
        );
      }
    }
    let found;
    try {
      found = await org.lookup(address);
    } catch (error) {
      if (creating) {
        return {
          mailbox: publicAllocation(store.setAllocation(id, revision, address, '', org.orgId, 'check')),
          created: true,
        };
      }
      if ([400, 404].includes(error.providerStatus))
        throw new HttpError(404, 'Zoho could not find that active primary mailbox.');
      throw error;
    }
    let ready = false;
    try {
      ready = await org.canOpen(found, company.mailboxes[id]);
    } catch {
      /* The directory entry can precede mailbox delegation. */
    }
    if (!ready && current?.status === 'ready' && !sameAddress(current.address, address))
      throw new HttpError(409, 'Grant access to the new Zoho mailbox before replacing the current assignment.');
    return store.transaction(() => {
      member(id);
      available(id, address, config());
      return {
        mailbox: publicAllocation(
          store.setAllocation(id, revision, address, found.accountId, org.orgId, ready ? 'ready' : 'pending')
        ),
        created: creating,
      };
    });
  }
  return { actions, dispatch };
}
