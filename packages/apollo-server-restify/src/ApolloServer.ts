import {
  Next,
  Request,
  Response,
  Server,
  plugins,
  RequestHandler
} from "restify";
import {
  renderPlaygroundPage,
  RenderPageOptions as PlaygroundRenderPageOptions,
} from '@apollographql/graphql-playground-html';
import {
  ApolloServerBase,
  GraphQLOptions,
  formatApolloErrors,
  processFileUploads,
} from 'apollo-server-core';
import accepts from 'accepts';
import typeis from 'type-is';

import {graphqlRestify} from './restifyApollo';
import BodyParserOptions = plugins.BodyParserOptions;
import QueryParserOptions = plugins.QueryParserOptions;

export {GraphQLOptions, GraphQLExtension} from 'apollo-server-core';

export type AsyncRequestHandler = (
  request: Request,
  response: Response,
  next: Next
) => Promise<any>


export interface GetMiddlewareOptions {
  path?: string;
  bodyParserConfig?: BodyParserOptions | boolean;
  queryParserConfig?: QueryParserOptions | boolean;
  onHealthCheck?: AsyncRequestHandler
  disableHealthCheck?: boolean;
}

export interface ServerRegistration extends GetMiddlewareOptions {
  app: Server;
}

export class ApolloServer extends ApolloServerBase {
  // This translates the arguments from the middleware into graphQL options It
  // provides typings for the integration specific behavior, ideally this would
  // be propagated with a generic to the super class
  async createGraphQLServerOptions(request: Request, response: Response, next:Next): Promise<GraphQLOptions> {
    return super.graphQLServerOptions({request, response, next});
  }

  protected supportsSubscriptions(): boolean {
    return true;
  }

  protected supportsUploads(): boolean {
    return true;
  }

  protected middlewareFromPath = (
    path: string,
    middleware: RequestHandler,
  ) => (request: Request, response: Response, next: Next) => {
    if (request.path() === path) {
      return middleware(request, response, next);
    } else {
      return next();
    }
  };

  public async applyMiddleware({
   app,
   path,
   bodyParserConfig,
   queryParserConfig,
   disableHealthCheck,
   onHealthCheck,
 }: ServerRegistration) {
    await this.willStart();

    if (!path) path = '/graphql';

    if (!disableHealthCheck) {
      app.get('/.well-known/apollo/server-health', this.healthCheckHandler(onHealthCheck));
    }


    if (this.uploadsConfig && typeof processFileUploads === 'function') {
      app.use(this.middlewareFromPath(path, this.fileUploadMiddleware))
    }

    let bodyParsers;

    if (bodyParserConfig === true) {
      bodyParsers = plugins.bodyParser();
    } else if (bodyParserConfig !== false) {
      bodyParsers = plugins.bodyParser(bodyParserConfig);
    }

    if( bodyParsers && Array.isArray(bodyParsers)){
      bodyParsers.map(parser => {
        app.use(this.middlewareFromPath(path, parser))
      })
    }

    if(queryParserConfig === true) {
      app.use(this.middlewareFromPath(path, plugins.queryParser()))
    } else if (queryParserConfig !== false){
      app.use(this.middlewareFromPath(path, plugins.queryParser(queryParserConfig)))
    }

    app.use(
      this.middlewareFromPath(
        path,
        (request: Request, response: Response, next: Next) => {
          if (this.playgroundOptions && request.method === 'GET') {
            // perform more expensive content-type check only if necessary
            const accept = accepts(request);
            const types = accept.types() as string[];
            const prefersHTML =
              types.find(
                (x: string) => x === 'text/html' || x === 'application/json',
              ) === 'text/html';

            if (prefersHTML) {
              const playgroundRenderPageOptions: PlaygroundRenderPageOptions = {
                endpoint: path,
                subscriptionEndpoint: this.subscriptionsPath,
                ...this.playgroundOptions,
              };
              response.header('Content-Type', 'text/html');
              const playground = renderPlaygroundPage(
                playgroundRenderPageOptions,
              );
              response.sendRaw(playground)
              return next();
            }
          }

          return graphqlRestify(
            (req, res, nxt) => {
              return this.createGraphQLServerOptions(req, res, nxt);
            })(request, response, next);
          })
    );

    // Dummy mounts as the request is handled by the middleware
    // Restify requires a matching route to execute the middleware stack
    // See: http://restify.com/docs/server-api/#use
    app.get(path, ()=>{});
    app.post(path, ()=>{});
  }


  protected healthCheckHandler(onHealthCheck: RequestHandler) {
    return function (request: Request, response: Response, next: Next) {
      // Response follows https://tools.ietf.org/html/draft-inadarei-api-health-check-01
      response.set('Content-Type', 'application/health+json');
      if (onHealthCheck) {
        return onHealthCheck(request, response, next)
          .then(() => {
            response.json({status: 'pass'})
            next();
          })
          .catch(() => {
            response.status(503);
            response.json({status: 'fail'})
            next();
          });
      } else {
        response.json({status: 'pass'})
        next();
      }
    }
  }

  protected async fileUploadMiddleware(request: Request, response: Response, next: Next) {
    if (typeis(request, ['multipart/form-data'])) {
      try {
        request.body = await processFileUploads(
          request,
          response,
          this.uploadsConfig,
        );
        return next();
      } catch (error) {
        if (error.status && error.expose) response.status(error.status)
        throw formatApolloErrors([error], {
          formatter: this.requestOptions.formatError,
          debug: this.requestOptions.debug,
        });
      }
    } else {
      return next();
    }
  }
}
