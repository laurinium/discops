export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Rippymcripface API',
    version: '0.1.0',
    description:
      'HTTP API for the CD ripping coordinator. Rippers communicate with the backend over gRPC; browsers use this HTTP/SSE API.',
  },
  servers: [{ url: '/', description: 'Current backend origin' }],
  tags: [
    { name: 'Health', description: 'Service health' },
    { name: 'State', description: 'Dashboard state and live updates' },
    { name: 'Commands', description: 'Validated commands sent to connected rippers' },
  ],
  paths: {
    '/healthz': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        operationId: 'getHealth',
        responses: {
          '200': {
            description: 'Backend is healthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
                examples: { healthy: { value: { ok: true } } },
              },
            },
          },
        },
      },
    },
    '/api/state': {
      get: {
        tags: ['State'],
        summary: 'Get current dashboard state',
        operationId: 'getState',
        responses: {
          '200': {
            description: 'Current drives and persisted history',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiState' },
              },
            },
          },
        },
      },
    },
    '/api/events': {
      get: {
        tags: ['State'],
        summary: 'Subscribe to live dashboard state updates',
        operationId: 'subscribeEvents',
        description:
          'Server-Sent Events stream. Each event contains a JSON ApiState payload in the SSE data field.',
        responses: {
          '200': {
            description: 'SSE stream of ApiState snapshots',
            content: {
              'text/event-stream': {
                schema: { type: 'string' },
                examples: {
                  message: {
                    value:
                      'data: {"drives":[],"history":[]}\\n\\n',
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/rippers/{ripperId}/{command}': {
      post: {
        tags: ['Commands'],
        summary: 'Send a command to a connected ripper',
        operationId: 'sendRipperCommand',
        parameters: [
          {
            name: 'ripperId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1 },
            example: 'drive-01',
          },
          {
            name: 'command',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: ['startRip', 'cancelRip', 'ejectDisc', 'refreshDisc', 'resetDrive'],
            },
          },
        ],
        responses: {
          '202': {
            description: 'Command accepted for delivery to the ripper',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CommandAccepted' },
                examples: { accepted: { value: { ok: true } } },
              },
            },
          },
          '404': {
            description: 'Unknown command',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '500': {
            description: 'Ripper is disconnected or command delivery failed',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['State'],
        summary: 'OpenAPI document',
        operationId: 'getOpenApiDocument',
        responses: {
          '200': {
            description: 'OpenAPI 3.1 document',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: {
        type: 'object',
        required: ['ok'],
        properties: { ok: { type: 'boolean' } },
      },
      ApiState: {
        type: 'object',
        required: ['drives', 'history'],
        properties: {
          drives: { type: 'array', items: { $ref: '#/components/schemas/DriveSnapshot' } },
          history: { type: 'array', items: { $ref: '#/components/schemas/HistoryJob' } },
        },
      },
      DriveSnapshot: {
        type: 'object',
        required: [
          'ripperId',
          'device',
          'connected',
          'state',
          'mediaPresent',
          'lastSeenAt',
          'logs',
        ],
        properties: {
          ripperId: { type: 'string', example: 'drive-01' },
          device: { type: 'string', example: '/dev/sr0' },
          connected: { type: 'boolean' },
          state: { $ref: '#/components/schemas/JobState' },
          mediaPresent: { type: 'boolean' },
          trayStatus: { type: 'string', enum: ['open', 'closed', 'unknown'] },
          discId: { type: 'string' },
          artist: { type: 'string' },
          album: { type: 'string' },
          tracks: { type: 'array', items: { $ref: '#/components/schemas/TrackMetadata' } },
          currentTrack: { type: 'integer', minimum: 1 },
          totalTracks: { type: 'integer', minimum: 1 },
          progressPercent: { type: 'number', minimum: 0, maximum: 100 },
          currentFile: { type: 'string' },
          lastSeenAt: { type: 'string', format: 'date-time' },
          logs: { type: 'array', items: { type: 'string' } },
          error: { type: 'string' },
        },
      },
      TrackMetadata: {
        type: 'object',
        required: ['number', 'title'],
        properties: {
          number: { type: 'integer', minimum: 1 },
          title: { type: 'string' },
        },
      },
      HistoryJob: {
        type: 'object',
        required: ['id', 'ripperId', 'device', 'state', 'startedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          ripperId: { type: 'string' },
          device: { type: 'string' },
          state: { $ref: '#/components/schemas/JobState' },
          artist: { type: 'string' },
          album: { type: 'string' },
          startedAt: { type: 'string', format: 'date-time' },
          finishedAt: { type: 'string', format: 'date-time' },
          error: { type: 'string' },
        },
      },
      JobState: {
        type: 'string',
        enum: [
          'idle',
          'disc-detected',
          'reading-metadata',
          'ready',
          'ripping',
          'encoding',
          'completed',
          'failed',
          'failed-metadata',
          'failed-read',
          'failed-encode',
          'failed-verify',
          'failed-finalize',
          'failed-interrupted',
          'cancelled',
          'ejected',
          'unsupported',
        ],
      },
      CommandAccepted: {
        type: 'object',
        required: ['ok'],
        properties: { ok: { type: 'boolean', const: true } },
      },
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: { error: { type: 'string' } },
      },
    },
  },
} as const;
