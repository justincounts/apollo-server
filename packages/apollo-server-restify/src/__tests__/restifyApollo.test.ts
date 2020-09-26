import {createServer, Server} from 'restify'
import testSuite, {
  NODE_MAJOR_VERSION,
  schema as Schema,
  CreateAppOptions,
} from 'apollo-server-integration-testsuite';
import { GraphQLOptions, Config } from 'apollo-server-core';

function createApp(options: CreateAppOptions = {}) {
  const { ApolloServer } = require('../ApolloServer');
  const app = createServer();

  const server = new ApolloServer(
    (options.graphqlOptions as Config) || { schema: Schema },
  );
  server.applyMiddleware({ app });
  return app.listen();
}

async function destroyApp(app: Server) {
  if (!app || !app.close) {
    return;
  }
  await new Promise(resolve => app.close(resolve));
}

// If we're on Node.js v6, skip this test, since `restify` doesn't support it
(
  NODE_MAJOR_VERSION === 6 ?
    describe.skip :
    describe
)('restifyApollo', () => {
  const { ApolloServer } = require('../ApolloServer');
  it('throws error if called without schema', function() {
    // @ts-ignore
    expect(() => new ApolloServer(undefined as GraphQLOptions)).toThrow(
      'ApolloServer requires options.',
    );
  });
});

describe('integration:Restify', () => {
  testSuite(createApp, destroyApp);
});
