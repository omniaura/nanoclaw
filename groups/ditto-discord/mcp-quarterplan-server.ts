#!/usr/bin/env bun
/**
 * QuarterPlan MCP Server
 * Provides tools for managing initiatives, tracking PRs, and ARR data
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { OmniS3Client } from './s3-client';

const server = new Server(
  {
    name: 'quarterplan',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const s3 = new OmniS3Client();

// Types
interface Initiative {
  id: string;
  title: string;
  description: string;
  owner: string;
  status: 'planning' | 'in-progress' | 'completed' | 'blocked';
  prs: string[]; // GitHub PR URLs
  created: string;
  updated: string;
  target_date?: string;
  tags?: string[];
}

interface QuarterPlanData {
  version: string;
  quarter: string;
  initiatives: Initiative[];
  created: string;
  lastUpdated: string;
}

interface ARRData {
  mrr: number;
  arr: number;
  users: number;
  updated: string;
}

// Helper functions
async function getQuarterPlan(): Promise<QuarterPlanData> {
  const data = await s3.readQuarterPlan('initiatives.json');
  return JSON.parse(data);
}

async function saveQuarterPlan(data: QuarterPlanData) {
  data.lastUpdated = new Date().toISOString();
  await s3.writeQuarterPlan('initiatives.json', JSON.stringify(data, null, 2));
}

async function getARRData(): Promise<ARRData> {
  const data = await s3.readQuarterPlan('arr-data.json');
  return JSON.parse(data);
}

async function saveARRData(data: ARRData) {
  data.updated = new Date().toISOString();
  await s3.writeQuarterPlan('arr-data.json', JSON.stringify(data, null, 2));
}

// Tool definitions
const tools: Tool[] = [
  {
    name: 'create_initiative',
    description: 'Create a new initiative in the quarter plan',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Initiative title' },
        description: { type: 'string', description: 'Detailed description' },
        owner: { type: 'string', description: 'Owner (agent or person name)' },
        target_date: { type: 'string', description: 'Target completion date (ISO format)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
      },
      required: ['title', 'description', 'owner'],
    },
  },
  {
    name: 'update_initiative',
    description: 'Update an existing initiative',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Initiative ID' },
        status: { type: 'string', enum: ['planning', 'in-progress', 'completed', 'blocked'] },
        description: { type: 'string' },
        target_date: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['id'],
    },
  },
  {
    name: 'link_pr',
    description: 'Link a GitHub PR to an initiative',
    inputSchema: {
      type: 'object',
      properties: {
        initiative_id: { type: 'string', description: 'Initiative ID' },
        pr_url: { type: 'string', description: 'GitHub PR URL' },
      },
      required: ['initiative_id', 'pr_url'],
    },
  },
  {
    name: 'get_quarter_plan',
    description: 'Get the current quarter plan with all initiatives',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['planning', 'in-progress', 'completed', 'blocked'], description: 'Filter by status' },
      },
    },
  },
  {
    name: 'add_update',
    description: 'Add a progress update to an initiative',
    inputSchema: {
      type: 'object',
      properties: {
        initiative_id: { type: 'string', description: 'Initiative ID' },
        update: { type: 'string', description: 'Progress update text' },
        author: { type: 'string', description: 'Update author (agent name)' },
      },
      required: ['initiative_id', 'update', 'author'],
    },
  },
  {
    name: 'update_arr_data',
    description: 'Update ARR/MRR statistics',
    inputSchema: {
      type: 'object',
      properties: {
        mrr: { type: 'number', description: 'Monthly Recurring Revenue' },
        arr: { type: 'number', description: 'Annual Recurring Revenue' },
        users: { type: 'number', description: 'Total users' },
      },
      required: [],
    },
  },
  {
    name: 'get_arr_data',
    description: 'Get current ARR/MRR statistics',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'create_initiative': {
        const plan = await getQuarterPlan();
        const initiative: Initiative = {
          id: `init-${Date.now()}`,
          title: args.title as string,
          description: args.description as string,
          owner: args.owner as string,
          status: 'planning',
          prs: [],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          target_date: args.target_date as string | undefined,
          tags: args.tags as string[] | undefined,
        };
        plan.initiatives.push(initiative);
        await saveQuarterPlan(plan);
        return {
          content: [{ type: 'text', text: JSON.stringify(initiative, null, 2) }],
        };
      }

      case 'update_initiative': {
        const plan = await getQuarterPlan();
        const initiative = plan.initiatives.find(i => i.id === args.id);
        if (!initiative) {
          return { content: [{ type: 'text', text: `Initiative ${args.id} not found` }], isError: true };
        }
        if (args.status) initiative.status = args.status as Initiative['status'];
        if (args.description) initiative.description = args.description as string;
        if (args.target_date) initiative.target_date = args.target_date as string;
        if (args.tags) initiative.tags = args.tags as string[];
        initiative.updated = new Date().toISOString();
        await saveQuarterPlan(plan);
        return {
          content: [{ type: 'text', text: JSON.stringify(initiative, null, 2) }],
        };
      }

      case 'link_pr': {
        const plan = await getQuarterPlan();
        const initiative = plan.initiatives.find(i => i.id === args.initiative_id);
        if (!initiative) {
          return { content: [{ type: 'text', text: `Initiative ${args.initiative_id} not found` }], isError: true };
        }
        if (!initiative.prs.includes(args.pr_url as string)) {
          initiative.prs.push(args.pr_url as string);
          initiative.updated = new Date().toISOString();
          await saveQuarterPlan(plan);
        }
        return {
          content: [{ type: 'text', text: `PR linked to ${initiative.title}` }],
        };
      }

      case 'get_quarter_plan': {
        const plan = await getQuarterPlan();
        let initiatives = plan.initiatives;
        if (args.status) {
          initiatives = initiatives.filter(i => i.status === args.status);
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({ ...plan, initiatives }, null, 2) }],
        };
      }

      case 'add_update': {
        const updateData = {
          initiative_id: args.initiative_id,
          update: args.update,
          author: args.author,
          timestamp: new Date().toISOString(),
        };
        const filename = `${args.initiative_id}-${Date.now()}.json`;
        await s3.upload(`quarterplan/updates/${filename}`, JSON.stringify(updateData, null, 2), 'application/json');
        return {
          content: [{ type: 'text', text: `Update added to ${args.initiative_id}` }],
        };
      }

      case 'update_arr_data': {
        const current = await getARRData();
        const updated: ARRData = {
          mrr: (args.mrr as number) ?? current.mrr,
          arr: (args.arr as number) ?? current.arr,
          users: (args.users as number) ?? current.users,
          updated: new Date().toISOString(),
        };
        await saveARRData(updated);
        return {
          content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
        };
      }

      case 'get_arr_data': {
        const data = await getARRData();
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error}` }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('QuarterPlan MCP server running on stdio');
}

main().catch(console.error);
