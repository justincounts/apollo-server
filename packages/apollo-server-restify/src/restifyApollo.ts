import {RequestHandler, Request, Response, Next} from "restify";
import {
  GraphQLOptions,
  HttpQueryError,
  runHttpQuery,
  convertNodeHttpToRequest,
} from 'apollo-server-core';
import { ValueOrPromise } from 'apollo-server-types';

export interface RestifyGraphQLOptionsFunction {
  (request: Request, response: Response, next:Next): ValueOrPromise<GraphQLOptions>;
}



export function graphqlRestify(
  options: GraphQLOptions |RestifyGraphQLOptionsFunction,
): RequestHandler {
  if (!options) {
    throw new Error('Apollo Server requires options.');
  }

  if (arguments.length > 1) {
    throw new Error(
      `Apollo Server expects exactly one argument, got ${arguments.length}`,
    );
  }

  const graphqlHandler = (request: Request, response: Response, next:Next): Promise<void> => {
    return runHttpQuery([request, response], {
      method: request.method,
      options: options,
      query:
        request.method === 'POST' ? request.body : request.query,
      request: convertNodeHttpToRequest(request),
    }).then(
      ({ graphqlResponse, responseInit }) => {
        Object.keys(responseInit.headers).forEach(key =>
          response.header(key, responseInit.headers[key]),
        );
        response.sendRaw(graphqlResponse)
        next();
      },
      (error: HttpQueryError) => {
        if ('HttpQueryError' !== error.name) {
          return  next(error);
        }

        if (error.headers) {
          Object.keys(error.headers).forEach(header => {
            response.set(header, error.headers[header]);
          });
        }

        response.status(error.statusCode)
        response.sendRaw(error.message)
        next();
      },
    );
  };

  return graphqlHandler;
}
