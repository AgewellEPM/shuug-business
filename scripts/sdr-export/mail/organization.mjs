import { randomBytes } from 'node:crypto';
import { HttpError } from '../../../sales/model.mjs';
import { sameAddress, zohoId, zohoSession } from './zoho-account.mjs';

const directoryScopes = [
  'ZohoMail.accounts.READ',
  'ZohoMail.organization.accounts.READ',
  'ZohoMail.organization.domains.READ',
];
const createScopes = ['ZohoMail.organization.accounts.CREATE'];
const pageSize = 50;

function mailbox(row) {
  if (
    !row ||
    !zohoId(row.accountId) ||
    !sameAddress(row.primaryEmailAddress, row.primaryEmailAddress) ||
    row.enabled === false ||
    row.status === false ||
    (row.mailboxStatus && row.mailboxStatus !== 'enabled') ||
    (row.type && row.type !== 'ZOHO_ACCOUNT')
  )
    return null;
  return {
    address: row.primaryEmailAddress.toLowerCase(),
    accountId: zohoId(row.accountId),
    name: String(row.displayName || row.accountDisplayName || row.primaryEmailAddress),
    outgoingEnabled: row.outgoingBlocked !== true,
  };
}
export function zohoOrganization(fetcher = fetch) {
  const directory = zohoSession(fetcher, directoryScopes),
    createSession = zohoSession(fetcher, createScopes);
  const mail = zohoSession(fetcher);
  async function context(config) {
    if (!config.ownerAddress || !config.clientId || !config.clientSecret)
      throw new HttpError(409, 'Authorize the company Zoho account in Senders first.');
    const rows = await directory.request(config, 'accounts');
    const owner = Array.isArray(rows) && rows.find((row) => sameAddress(row.primaryEmailAddress, config.ownerAddress));
    const detected = zohoId(owner?.policyId?.zoid || owner?.zoid);
    if (!owner || (config.orgId && detected && config.orgId !== detected) || !(config.orgId || detected)) {
      throw new HttpError(403, 'Zoho could not verify the workspace owner’s organization.');
    }
    const orgId = config.orgId || detected,
      root = 'organization/' + orgId + '/';
    return {
      orgId,
      async list(offset = 0) {
        const rows = await directory.request(config, root + 'accounts?start=' + offset + '&limit=' + pageSize);
        if (!Array.isArray(rows)) throw new HttpError(502, 'Zoho could not list company mailboxes.');
        return {
          accounts: rows.map(mailbox).filter(Boolean),
          next: rows.length === pageSize ? offset + pageSize : null,
        };
      },
      async domains() {
        const rows = await directory.request(config, root + 'domains');
        if (!Array.isArray(rows?.domainVO)) throw new HttpError(502, 'Zoho could not list the company domains.');
        return rows.domainVO
          .filter((row) => row.verificationStatus === true && !row.isDomainAlias && row.mailHostingEnabled !== false)
          .map((row) => String(row.domainName || '').toLowerCase())
          .filter(Boolean);
      },
      async lookup(address) {
        const row = await directory.request(config, root + 'accounts/' + encodeURIComponent(address));
        const found = mailbox(row);
        if (!found || !sameAddress(found.address, address))
          throw new HttpError(404, 'Zoho could not find that active primary mailbox.');
        return found;
      },
      async create(address, name, password) {
        const names = name.trim().split(/\s+/);
        const data = await createSession.request(config, root + 'accounts', {
          method: 'POST',
          json: {
            primaryEmailAddress: address,
            displayName: name,
            firstName: names[0],
            lastName: names.slice(1).join(' ') || names[0],
            password: password || randomBytes(24).toString('base64url') + '!Aa9',
            role: 'member',
          },
        });
        if (data?.primaryEmailAddress && !sameAddress(data.primaryEmailAddress, address))
          throw new HttpError(502, 'Verify the new mailbox in Zoho.');
      },
      async canOpen(found, installed) {
        if (!found.outgoingEnabled) return false;
        const personal = sameAddress(installed?.address, found.address) && installed.refreshToken;
        const candidate = { ...config, refreshToken: personal || config.refreshToken, orgId: personal ? '' : orgId };
        const api = await mail.open({
          config: candidate,
          configured: true,
          directoryLookup: !personal,
          accountId: found.accountId,
          address: found.address,
        });
        const folders = await api('folders');
        const inbox = Array.isArray(folders) && folders.find((folder) => folder.folderType === 'Inbox' && zohoId(folder.folderId));
        if (!inbox) return false;
        return Array.isArray(await api('messages/view?folderId=' + inbox.folderId + '&limit=1&start=1'));
      },
    };
  }
  return { context };
}
