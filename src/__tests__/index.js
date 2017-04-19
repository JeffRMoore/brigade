/* eslint-env jest */
/* @flow */

import { compose, callMiddleware } from '../index';

describe('compose', () => {
  const terminate = () => Promise.resolve({});

  describe('empty brigade', () => {
    const emptyBrigade = [];

    it('should propagate the return value of calling next', async () => {
      const expectedValue = { result: 'hello' };
      const nextFn = () => Promise.resolve(expectedValue);

      const result = await compose(emptyBrigade)({}, nextFn, terminate);
      expect(result).toBe(expectedValue);
    });

    it('should catch an exception in next', async () => {
      const expectedMessage = 'test';
      const nextFn = () => {
        throw new Error(expectedMessage);
      };

      expect.assertions(2);
      try {
        await compose(emptyBrigade)({}, nextFn, terminate);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toBe(expectedMessage);
      }
    });

    it('should catch a rejected promise in next', async () => {
      const expectedMessage = 'hello';
      const nextFn = () => Promise.reject(new Error(expectedMessage));

      expect.assertions(2);
      try {
        await compose(emptyBrigade)({}, nextFn, terminate);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toBe(expectedMessage);
      }
    });

    it('should only accept functions for next', async () => {
      const notAFunction = {};
      expect.assertions(2);
      try {
        // $FlowFixMe: override violation for test case
        await compose(emptyBrigade)({}, notAFunction, terminate);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toMatch(/must be a function/);
      }
    });

    it('should only accept functions for skipNext', async () => {
      const notAFunction = {};
      expect.assertions(2);
      try {
        // $FlowFixMe: override violation for test case
        await compose(emptyBrigade)({}, terminate, notAFunction);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toMatch(/must be a function/);
      }
    });
  });

  describe('parameters', () => {
    it('should only accept an array of middleware', async () => {
      const notAnArray = null;
      expect.assertions(2);
      try {
        // $FlowFixMe: override violation for test case
        await compose(notAnArray);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toMatch(/must be an array/);
      }
    });

    it('should only accept middleware as functions', async () => {
      const notMiddleware = {};
      expect.assertions(2);
      try {
        // $FlowFixMe: override type violation for test case
        await compose([notMiddleware]);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toMatch(/must be composed of functions/);
      }
    });
  });

  describe('deep brigade', () => {
    const deepContext = {
      receivedCalls: []
    };
    const deepBrigade = [
      async (context, next) => {
        context.receivedCalls.push(1);
        const result = await next();
        context.receivedCalls.push(6);
        return result;
      },
      async (context, next) => {
        context.receivedCalls.push(2);
        const result = await next();
        context.receivedCalls.push(5);
        return result;
      },
      async (context, next) => {
        context.receivedCalls.push(3);
        const result = await next();
        context.receivedCalls.push(4);
        return result;
      }
    ];

    beforeEach(() => {
      deepContext.receivedCalls = [];
    });

    it('should call middleware stack in the right order', async () => {
      await compose(deepBrigade)(deepContext, terminate, terminate);
      expect(deepContext.receivedCalls).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should be able to be called twice', async () => {
      const brigade = compose(deepBrigade);
      await brigade(deepContext, terminate, terminate);
      expect(deepContext.receivedCalls).toEqual([1, 2, 3, 4, 5, 6]);
      deepContext.receivedCalls = [];
      await brigade(deepContext, terminate, terminate);
      expect(deepContext.receivedCalls).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should propagate the value of calling next', async () => {
      const exepctedValue = { result: 'hello' };
      const nextFn = () => Promise.resolve(exepctedValue);
      const brigade = compose(deepBrigade);
      const result = await brigade(deepContext, nextFn, terminate);
      expect(result).toBe(exepctedValue);
    });

    describe('with Skip at the end', () => {
      const brigadeWithSkip = deepBrigade.slice(0);
      brigadeWithSkip.push((ctx, next, skipNext) => skipNext());

      it('should propagate the value of calling skipNext', async () => {
        const exepctedValue = { result: 'hello' };
        const skipFn = () => Promise.resolve(exepctedValue);
        const brigade = compose(brigadeWithSkip);
        const result = await brigade(deepContext, terminate, skipFn);
        expect(result).toBe(exepctedValue);
      });

      it('should catch an exception in skipNext', async () => {
        const expectedMessage = 'hello';
        const skipFn = () => {
          throw new Error(expectedMessage);
        };

        expect.assertions(2);
        try {
          const brigade = compose(brigadeWithSkip);
          await brigade(deepContext, terminate, skipFn);
        } catch (e) {
          expect(e).toBeInstanceOf(Error);
          expect(e.message).toBe(expectedMessage);
        }
      });

      it('should catch a rejected promise in skipNext', async () => {
        const expectedMessage = 'hello';
        const skipFn = () => Promise.reject(new Error(expectedMessage));

        expect.assertions(2);
        try {
          const brigade = compose(brigadeWithSkip);
          await brigade(deepContext, terminate, skipFn);
        } catch (e) {
          expect(e).toBeInstanceOf(Error);
          expect(e.message).toBe(expectedMessage);
        }
      });
    });
  });

  it('should throw if middleware doesn not return a promise', async () => {
    const notAPromise = 0;
    const middleware = [
      // $FlowFixMe: override violation for test case
      () => notAPromise
    ];

    expect.assertions(2);
    try {
      await compose(middleware)({}, terminate, terminate);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/Promise was expected/);
    }
  });

  it('should keep the context across multiple middleware', () => {
    const ctx = {};

    const stack = [];

    const middleware = async (ctx2, next) => {
      const result = await next();
      expect(ctx2).toBe(ctx);
      return result;
    };

    stack.push(middleware);
    stack.push(middleware);
    stack.push(middleware);

    return compose(stack)(ctx, terminate, terminate);
  });

  it('should reject on errors in middleware', async () => {
    const stack = [];
    const sentintel = jest.fn();

    stack.push(() => { throw new Error(); });

    await compose(stack)({}, terminate, terminate)
      .then(sentintel)
      .catch((err) => {
        expect(err).toBeInstanceOf(Error);
      });
    expect(sentintel).not.toHaveBeenCalled();
  });

  it('should not call next with middleware parameters', () => {
    const brigade = [];
    expect.assertions(3);
    return compose(brigade)({}, (ctx, next, skipNext) => {
      expect(ctx).toBe(undefined);
      expect(next).toBe(undefined);
      expect(skipNext).toBe(undefined);
      return Promise.resolve({});
    }, terminate);
  });

  it('should not call skipNext with middleware parameters', () => {
    const brigade = [(context, next, skipNext) => skipNext()];
    expect.assertions(3);
    return compose(brigade)({}, terminate, (ctx, next, skipNext) => {
      expect(ctx).toBe(undefined);
      expect(next).toBe(undefined);
      expect(skipNext).toBe(undefined);
      return Promise.resolve({});
    });
  });

  it('should throw if skipNext() is called multiple times at the beginning', async () => {
    const middleware = [
      function badDog(ctx, next, skipNext) {
        skipNext();
        return skipNext();
      },
      (ctx, next) => next()
    ];

    expect.assertions(3);
    try {
      await compose(middleware)({}, terminate, terminate);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/has called its skipNext function after the middleware chain has been terminated/);
      expect(e.message).toMatch(/badDog/);
    }
  });

  it('should throw if next() is called multiple times at the beginning', async () => {
    const middleware = [
      function badDog(ctx, next) {
        next();
        return next();
      },
      (ctx, next) => next()
    ];

    expect.assertions(3);
    try {
      await compose(middleware)({}, terminate, terminate);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/has called its next function after the middleware chain has been terminated/);
      expect(e.message).toMatch(/badDog/);
    }
  });

  it('should throw if skipNext() is called multiple times at the end', async () => {
    const middleware = [
      (ctx, next) => next(),
      function badDog(ctx, next, skipNext) {
        skipNext();
        return skipNext();
      }
    ];

    expect.assertions(2);
    try {
      await compose(middleware)({}, terminate, terminate);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/has called its skipNext function after the middleware chain has been terminated/);
    }
  });

  it('should throw if next() is called multiple times at the end', async () => {
    const middleware = [
      (ctx, next) => next(),
      function badDog(ctx, next) {
        next();
        return next();
      }
    ];

    expect.assertions(3);
    try {
      await compose(middleware)({}, terminate, terminate);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/has called its next function after the middleware chain has been terminated/);
      expect(e.message).toMatch(/badDog/);
    }
  });

  it('should throw if skipNext() is called after next()', async () => {
    const middleware = [
      async function badDog(ctx, next, skipNext) {
        next();
        return skipNext();
      }
    ];

    expect.assertions(3);
    try {
      await compose(middleware)({}, terminate, terminate);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/has called its skipNext function after the middleware chain has been terminated/);
      expect(e.message).toMatch(/badDog/);
    }
  });

  it('should throw if next() is called after skipNext()', async () => {
    const middleware = [
      // Flow should probably catch this
      async function badDog(ctx, next, skipNext) {
        await skipNext();
        await next();
      }
    ];

    expect.assertions(3);
    try {
      await compose(middleware)({}, terminate, terminate);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/has called its next function after the middleware chain has been terminated/);
      expect(e.message).toMatch(/badDog/);
    }
  });

  describe('middleware error message', () => {
    it('should identify middleware with an error', async () => {
      const middleware = [
        function badDog() {
          // $FlowFixMe: override violation for test case
          return 'woof';
        }
      ];

      expect.assertions(2);
      try {
        await compose(middleware)({}, terminate, terminate);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toMatch(/badDog/);
      }
    });
  });

  describe('callMiddleware', () => {
    it('should work', async () => {
      const middleware = [
        async (request, next) => next()
      ];

      const expectedResponse = {};
      const result = await callMiddleware(compose(middleware), {}, expectedResponse);
      expect(result).toBe(expectedResponse);
    });

    it('should detect if next() or skipNext() not called', async () => {
      const middleware = [
        // Flow should probably catch this
        async () => {
        }
      ];

      expect.assertions(2);
      try {
        await callMiddleware(compose(middleware), {}, {});
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toMatch(/terminated with an unexpected response/);
      }
    });

    it('should detect if the chain is broken', async () => {
      const middleware = [
        // Flow should probably catch this
        async (ctx, next) => {
          next();
        },
        async (ctx, next) => next()
      ];

      expect.assertions(2);
      try {
        await callMiddleware(compose(middleware), {}, {});
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toMatch(/terminated with an unexpected response/);
      }
    });
  });
});
