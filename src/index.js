/* @flow */

import invariant from 'invariant';

/**
 * Request object to be passed to each middleware in a brigade
 */
type MiddlewareRequest = Object;

/**
 * Response Object that is the result of calling a middleware
 */
type MiddlewareResponse = Promise<mixed>;

/**
 * Process the rest of the middleware brigade
 */
type ContinueMiddleware = () => MiddlewareResponse;

/**
 * Signature of a Brigade middleware function
 */
export type Middleware = (
    request: MiddlewareRequest,
    next: ContinueMiddleware,
    terminate: ContinueMiddleware) => MiddlewareResponse;

/**
 * A Chain of middleware
 */
export type Brigade = Array<Middleware>;

/**
 * Compose an error message that identifies the middleware
 * which triggered the error.
 */
function locatedError(
  brigade: Brigade,
  i: number,
  message: string
): string {
  if (i >= 0 && i < brigade.length) {
    return `Composed middleware #${i} '${brigade[i].name}' ${message}`;
  }
  return message;
}

/**
 * Call a middleware, which might possibly be a composed brigade, with a request and response object
 */
export function callMiddleware(
  middleware: Middleware,
  request: MiddlewareRequest,
  response?: Object
): MiddlewareResponse {
  invariant(typeof middleware === 'function',
    'Middleware must be a function');
  invariant(typeof request === 'object' && request !== null,
    'request must be an object');
  invariant(response === undefined || (typeof response === 'object' && response !== null),
    'response must be an object if specified');
  const continueFn: ContinueMiddleware = () => Promise.resolve(response);
  return middleware(request, continueFn, continueFn).then((result) => {
    if (response !== undefined && result !== response) {
      return Promise.reject(new Error(
        'Middleware brigade terminated with an unexpected response value indicating ' +
        'that a middleware function failed to call next or terminate, or failed to ' +
        'incorporate the resulting value into its own return value'
      ));
    }
    if (result === undefined) {
      return Promise.reject(new Error(
        'Middleware brigade result cannot be undefined'
      ));
    }
    return result;
  });
}

/**
 * Compose a middleware "brigade" function composed of a sequence of
 * individual middleware functions.
 */
export function compose(brigade: Brigade): Middleware {
  invariant(Array.isArray(brigade),
    'Middleware brigade must be an array');
  invariant(brigade.every(fn => typeof fn === 'function'),
    'Middleware brigade must be composed of functions');

  /**
   * Middleware function representing composition of middleware into a brigade
   */
  return function composedMiddleware(
    request: MiddlewareRequest,
    next: ContinueMiddleware,
    terminate: ContinueMiddleware
  ): MiddlewareResponse {
    invariant(typeof next === 'function',
      'next parameter to composed middleware must be a function');
    invariant(typeof terminate === 'function',
      'terminate parameter to composed middleware must be a function');

    let hasTerminated = false;

    return dispatchToMiddleware(0);

    /**
     * Dispatch to the i-th middleware in the composed middleware brigade, capturing
     * the state necessary to continue the process in the `dispatchNext`
     * and `dispatchTerminate` closures.
     * @param {Number} i
     */
    function dispatchToMiddleware(i: number): MiddlewareResponse {
      if (hasTerminated) {
        throw new Error(locatedError(
          brigade,
          i - 1,
          'has called its next function after the middleware brigade has been terminated by a prior ' +
          'call to either its next function or its terminate function'
        ));
      }
      try {
        let response;
        if (i < brigade.length) {
          response = brigade[i](request, dispatchNext, dispatchTerminate);
        } else {
          hasTerminated = true;
          response = next();
        }
        if (typeof response === 'object' && response !== null && typeof response.then === 'function') {
          return response;
        }
        return Promise.reject(new TypeError(locatedError(
          brigade,
          i,
          `has returned a value of type '${typeof response}' when a Promise was expected`
        )));
      } catch (err) {
        return Promise.reject(err);
      }

      /**
       * Dispatch to the next middleware in the brigade
       */
      function dispatchNext(): MiddlewareResponse {
        return dispatchToMiddleware(i + 1);
      }

      /**
       * prematurely terminate the middleware brigade
       */
      function dispatchTerminate(): MiddlewareResponse {
        if (hasTerminated) {
          throw new Error(locatedError(
            brigade,
            i,
            'has called its terminate function after the middleware brigade has been terminated by a prior ' +
            'call to either its next function or its terminate function'
          ));
        }
        hasTerminated = true;
        return terminate();
      }
    }
  };
}
