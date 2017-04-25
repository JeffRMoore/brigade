/* @flow */

import invariant from 'invariant';

/**
 * Request object processed through middleware chain
 */
type MiddlewareRequest = Object;

/**
 * Response Object processed through middleware chain
 */
type MiddlewareResponse<T: Object> = Promise<T>;

/**
 * Process the rest of the middleware chain
 */
type ContinueMiddleware = () => MiddlewareResponse<*>;

/**
 * Signature of a middleware function
 */
export type Middleware = (
    request: MiddlewareRequest,
    next: ContinueMiddleware,
    skipNext: ContinueMiddleware) => MiddlewareResponse<*>;

/**
 * A Chain of middleware to call
 */
export type MiddlewareChain = Array<Middleware>;

/**
 * Compose an error message that identifies the middleware
 * which triggered the error.
 */
function locatedError(
  middleware: MiddlewareChain,
  i: number,
  message: string
): string {
  let name;
  if (i < 0) {
    name = 'XYZZY-UPDATE-ME';
  } else if (i < middleware.length) {
    name = middleware[i].name;
  } else {
    name = 'XYZZY-UPDATE-ME';
  }
  return `Composed middleware #${i} '${name}' ${message}`;
}

/**
 * Call a middleware brigade with a request and response object
 */
export function callMiddleware<RESPONSE: Object>(
  middleware: Middleware,
  request: MiddlewareRequest,
  response: RESPONSE
): MiddlewareResponse<RESPONSE> {
  const terminate = () => Promise.resolve(response);
  return middleware(request, terminate, terminate).then((result) => {
    if (result !== response) {
      return Promise.reject(new Error(
        'Middleware brigade terminated with an unexpected response value indicating ' +
        'that a middleware function failed to call next or skipNext, or failed to ' +
        'incorporate the resulting value into its own return value'
      ));
    }
    return result;
  });
}

/**
 * Compose a middleware "brigade" function composed of a sequence of
 * individual middleware functions.
 */
export function compose(middleware: MiddlewareChain): Middleware {
  invariant(Array.isArray(middleware),
    'Middleware stack must be an array');
  invariant(middleware.every(fn => typeof fn === 'function'),
    'Middleware must be composed of functions');

  /**
   * Middleware function representing composition of middleware stack
   */
  return function composedMiddleware(
    request: MiddlewareRequest,
    next: ContinueMiddleware,
    skipNext: ContinueMiddleware
  ): MiddlewareResponse<*> {
    invariant(typeof next === 'function',
      'next parameter to composed middleware must be a function');
    invariant(typeof skipNext === 'function',
      'skipNext parameter to composed middleware must be a function');

    let hasTerminated = false;

    return dispatch(0);

    /**
     * Dispatch to the i-th middleware in the composed stack, capturing
     * the state necessary to continue the process in the `dispatchNext`
     * and `dispatchSkipNext` closures.
     * @param {Number} i
     */
    function dispatch(i: number): MiddlewareResponse<*> {
      if (hasTerminated) {
        throw new Error(locatedError(
          middleware,
          i - 1,
          'has called its next function after the middleware chain has been terminated by a prior ' +
          'call to either its next function or its skipNext function'
        ));
      }
      try {
        let result;
        if (i < middleware.length) {
          result = middleware[i](request, dispatchNext, dispatchSkipNext);
        } else {
          hasTerminated = true;
          result = next();
        }
        if (typeof result === 'object' && result !== null && typeof result.then === 'function') {
          return result;
        }
        return Promise.reject(new TypeError(locatedError(
          middleware,
          i,
          `has returned a value of type '${typeof result}' when a Promise was expected`
        )));
      } catch (err) {
        return Promise.reject(err);
      }

      /**
       * Dispatch to the next middleware in the chain
       */
      function dispatchNext(): MiddlewareResponse<*> {
        return dispatch(i + 1);
      }

      /**
       * prematurely terminate the middleware chain
       */
      function dispatchSkipNext(): MiddlewareResponse<*> {
        if (hasTerminated) {
          throw new Error(locatedError(
            middleware,
            i,
            'has called its skipNext function after the middleware chain has been terminated by a prior ' +
            'call to either its next function or its skipNext function'
          ));
        }
        hasTerminated = true;
        return skipNext();
      }
    }
  };
}
