/* eslint-env jest */
/* @flow */

import { compose, callMiddleware } from '../index';

describe('compose', () => {
  const defaultContinueFn = () => Promise.resolve({});

  describe('empty brigade', () => {
    const emptyBrigade = [];

    it('should propagate the return value of calling next', async () => {
      const expectedValue = { result: 'hello' };
      const nextFn = () => Promise.resolve(expectedValue);

      const result = await compose(emptyBrigade)({}, nextFn, defaultContinueFn);
      expect(result).toBe(expectedValue);
    });

    it('should catch an exception in next', async () => {
      const expectedMessage = 'test';
      const nextFn = () => {
        throw new Error(expectedMessage);
      };

      expect.assertions(2);
      try {
        await compose(emptyBrigade)({}, nextFn, defaultContinueFn);
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
        await compose(emptyBrigade)({}, nextFn, defaultContinueFn);
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
        await compose(emptyBrigade)({}, notAFunction, defaultContinueFn);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toMatch(/must be a function/);
      }
    });

    it('should only accept functions for terminate', async () => {
      const notAFunction = {};
      expect.assertions(2);
      try {
        // $FlowFixMe: override violation for test case
        await compose(emptyBrigade)({}, defaultContinueFn, notAFunction);
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
    const deepRequest = {
      receivedCalls: []
    };
    const deepBrigade = [
      async (request, next) => {
        request.receivedCalls.push(1);
        const result = await next();
        request.receivedCalls.push(6);
        return result;
      },
      async (request, next) => {
        request.receivedCalls.push(2);
        const result = await next();
        request.receivedCalls.push(5);
        return result;
      },
      async (request, next) => {
        request.receivedCalls.push(3);
        const result = await next();
        request.receivedCalls.push(4);
        return result;
      }
    ];

    beforeEach(() => {
      deepRequest.receivedCalls = [];
    });

    it('should call middleware stack in the right order', async () => {
      await compose(deepBrigade)(deepRequest, defaultContinueFn, defaultContinueFn);
      expect(deepRequest.receivedCalls).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should be able to be called twice', async () => {
      const brigade = compose(deepBrigade);
      await brigade(deepRequest, defaultContinueFn, defaultContinueFn);
      expect(deepRequest.receivedCalls).toEqual([1, 2, 3, 4, 5, 6]);
      deepRequest.receivedCalls = [];
      await brigade(deepRequest, defaultContinueFn, defaultContinueFn);
      expect(deepRequest.receivedCalls).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should propagate the value of calling next', async () => {
      const exepctedValue = { result: 'hello' };
      const nextFn = () => Promise.resolve(exepctedValue);
      const brigade = compose(deepBrigade);
      const result = await brigade(deepRequest, nextFn, defaultContinueFn);
      expect(result).toBe(exepctedValue);
    });

    describe('with terminate at the end', () => {
      const brigadeWithTerminate = deepBrigade.slice(0);
      brigadeWithTerminate.push((request, next, terminate) => terminate());

      it('should propagate the value of calling terminate', async () => {
        const exepctedValue = { result: 'hello' };
        const terminateFn = () => Promise.resolve(exepctedValue);
        const brigade = compose(brigadeWithTerminate);
        const result = await brigade(deepRequest, defaultContinueFn, terminateFn);
        expect(result).toBe(exepctedValue);
      });

      it('should catch an exception in terminate', async () => {
        const expectedMessage = 'hello';
        const terminateFn = () => {
          throw new Error(expectedMessage);
        };

        expect.assertions(2);
        try {
          const brigade = compose(brigadeWithTerminate);
          await brigade(deepRequest, defaultContinueFn, terminateFn);
        } catch (e) {
          expect(e).toBeInstanceOf(Error);
          expect(e.message).toBe(expectedMessage);
        }
      });

      it('should catch a rejected promise in terminate', async () => {
        const expectedMessage = 'hello';
        const terminateFn = () => Promise.reject(new Error(expectedMessage));

        expect.assertions(2);
        try {
          const brigade = compose(brigadeWithTerminate);
          await brigade(deepRequest, defaultContinueFn, terminateFn);
        } catch (e) {
          expect(e).toBeInstanceOf(Error);
          expect(e.message).toBe(expectedMessage);
        }
      });
    });
  });

  it('should throw if middleware does not return a promise', async () => {
    const notAPromise = 0;
    const middleware = [
      // $FlowFixMe: override violation for test case
      () => notAPromise
    ];

    expect.assertions(2);
    try {
      await compose(middleware)({}, defaultContinueFn, defaultContinueFn);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/Promise was expected/);
    }
  });

  it('should keep the request across multiple middleware', () => {
    const originalRequest = {};

    const stack = [];

    const middleware = async (receivedRequest, next) => {
      const result = await next();
      expect(receivedRequest).toBe(originalRequest);
      return result;
    };

    stack.push(middleware);
    stack.push(middleware);
    stack.push(middleware);

    return compose(stack)(originalRequest, defaultContinueFn, defaultContinueFn);
  });

  it('should reject on errors in middleware', async () => {
    const stack = [];
    const sentintel = jest.fn();

    stack.push(() => { throw new Error(); });

    await compose(stack)({}, defaultContinueFn, defaultContinueFn)
      .then(sentintel)
      .catch((err) => {
        expect(err).toBeInstanceOf(Error);
      });
    expect(sentintel).not.toHaveBeenCalled();
  });

  it('should not call next with middleware parameters', () => {
    const brigade = [];
    expect.assertions(3);
    return compose(brigade)({}, (request, next, terminate) => {
      expect(request).toBe(undefined);
      expect(next).toBe(undefined);
      expect(terminate).toBe(undefined);
      return Promise.resolve({});
    }, defaultContinueFn);
  });

  it('should not call terminate with middleware parameters', () => {
    const brigade = [(context, next, terminate) => terminate()];
    expect.assertions(3);
    return compose(brigade)({}, defaultContinueFn, (request, next, terminate) => {
      expect(request).toBe(undefined);
      expect(next).toBe(undefined);
      expect(terminate).toBe(undefined);
      return Promise.resolve({});
    });
  });

  it('should throw if terminate is called multiple times at the beginning of a brigade', async () => {
    const middleware = [
      function badDog(request, next, terminate) {
        terminate();
        return terminate();
      },
      (request, next) => next()
    ];

    expect.assertions(3);
    try {
      await compose(middleware)({}, defaultContinueFn, defaultContinueFn);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/has called its terminate function after the middleware chain has been terminated/);
      expect(e.message).toMatch(/badDog/);
    }
  });

  it('should throw if next() is called multiple times at the beginning of a brigade', async () => {
    const middleware = [
      function badDog(request, next) {
        next();
        return next();
      },
      (request, next) => next()
    ];

    expect.assertions(3);
    try {
      await compose(middleware)({}, defaultContinueFn, defaultContinueFn);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/has called its next function after the middleware chain has been terminated/);
      expect(e.message).toMatch(/badDog/);
    }
  });

  it('should throw if terminate is called multiple times at the end of a brigade', async () => {
    const middleware = [
      (request, next) => next(),
      function badDog(request, next, terminate) {
        terminate();
        return terminate();
      }
    ];

    expect.assertions(2);
    try {
      await compose(middleware)({}, defaultContinueFn, defaultContinueFn);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/has called its terminate function after the middleware chain has been terminated/);
    }
  });

  it('should throw if next is called multiple times at the end of a brigade', async () => {
    const middleware = [
      (request, next) => next(),
      function badDog(request, next) {
        next();
        return next();
      }
    ];

    expect.assertions(3);
    try {
      await compose(middleware)({}, defaultContinueFn, defaultContinueFn);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/has called its next function after the middleware chain has been terminated/);
      expect(e.message).toMatch(/badDog/);
    }
  });

  it('should throw if terminate is called after next', async () => {
    const middleware = [
      async function badDog(request, next, terminate) {
        next();
        return terminate();
      }
    ];

    expect.assertions(3);
    try {
      await compose(middleware)({}, defaultContinueFn, defaultContinueFn);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch(/has called its terminate function after the middleware chain has been terminated/);
      expect(e.message).toMatch(/badDog/);
    }
  });

  it('should throw if next is called after terminate', async () => {
    const middleware = [
      // Flow should probably catch this
      async function badDog(request, next, terminate) {
        await terminate();
        await next();
      }
    ];

    expect.assertions(3);
    try {
      await compose(middleware)({}, defaultContinueFn, defaultContinueFn);
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
        await compose(middleware)({}, defaultContinueFn, defaultContinueFn);
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

    it('should allow a rejected promise to be returned', async () => {
      const expectedMessage = 'hello';
      const middleware = [
        (request, next, terminate) => {
          return Promise.reject(new Error(expectedMessage));
        }
      ];

      expect.assertions(2);
      try {
        await callMiddleware(compose(middleware), {}, {});
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toBe(expectedMessage);
      }
    });

    it('should detect if next or terminate not called', async () => {
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
        async (request, next) => {
          next();
        },
        async (request, next) => next()
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
