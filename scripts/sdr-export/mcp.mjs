import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerSalesMcp } from '../../src/lib/backend/sales-mcp.ts';
import { createSalesConnection } from '../sales/mcp-connection.ts';
import { dataDirectory } from './setup.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = process.env.SDR_ORIGIN || 'http://127.0.0.1:' + (process.env.SDR_PORT || 8740);
const email = process.env.SDR_AGENT_EMAIL;
if (email && !process.env.SDR_ACCESS_CODE_FILE) throw new Error('Specify an access-code file for this agent.');
const codeFile = process.env.SDR_ACCESS_CODE_FILE || resolve(dataDirectory(root), 'owner-code');
const server = new McpServer({ name: 'universal-sdr', version: '1.0.0' });
registerSalesMcp(server, createSalesConnection({ origin, codeFile, email, project: true }));
await server.connect(new StdioServerTransport());
