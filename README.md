# Middleware Brigade

Brigade is a library for composing and calling middleware.  Middleware is a pattern
for using a series of semi-independent modules to accomplish a goal or compute a result.
Each module is called a middleware and has a standard function signature and receives data in a 
standard format.  The middleware then processes the data and passes control to the next middleware
in the chain. 

Brigade is named after the concept of a [Bucket Brigade](https://en.wikipedia.org/wiki/Bucket_brigade)

## Brigade Middleware Signature

A brigade middleware is always asynchronous.  If javascript [`async`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function) functions are used, it has the following signature:

```js
async function middleware(request, next, terminate) {
  
}
```

or, alternatively, if a `Promise` object is explicitly returned from a standard function

```js
function middleware(request, next, terminate) {
  return Promise.reject(new Error('Failure'));  
}
```

`request` represents the data that is to be operated on and must be an object.

`next` and `terminate` are functions that determine how the rest of the middleware chain is processed.
These are known as _continue functions_.  The middleware function MUST call either `next` or `terminate`, or throw an error
 or return a rejected promise.

if `next` is called, then control is passed to the next middleware in the chain, which will receive the
same `request` object.

```js
async function middleware(request, next, terminate) {
  result = await next();
  // slightly redundant for clarity.
  return result;
}
```

if `terminate` is called, the current middleware will be considered the end of the middleware chain and
no further middleware will be called in this chain.

Both `next` and `terminate` are asynchronous functions and their return values must be appropriately processed.
In the prior example, an `async` function, `await` can be used to wait for the return value, which should
be returned from the middleware.

```js
function middleware(request, next, terminate) {
  return next().then(result => { /* stuff */ return result; });
}
```

If the `Promise` form is used, the promise returned by `next` or `terminate` can be used or returned.

Most middleware will call `next`, so declaring the `terminate` parameter is optional.

```js
function middleware(request, next) {
  return next().then(result => { /* stuff */ return result; });
}
```

Each middleware must return either a rejected promise indicating an error or a promise that resolves to the
result of the middleware chain.  Usually, the result is simply received from calling `next` or `terminate`,
modified, and then returned.  This is very much like a bucket brigade.

`await` is not required if the result of calling `next` is returned directly.  This is acceptable:

```js
function middleware(request, next) {
  return next();
}
```

or

```js
async function middleware(request, next) {
  return next();
}
```

## Composing a Brigade

A set of middleware can be composed into a _brigade_.  A brigade has the middleware signature and
can itself be composed into another brigade, or called directly.

```js
import compose from 'middleware-brigade'

const myBrigade = compose([
  async (context, next) => {
    // Do something
    const result = await next();
    // Do something else
    return result;
  },  
  async (context, next) => {
    // Do something
    const result = await next();
    // Do something else
    return result;
  },  
]);
```

When middleware functions are composed into a brigade, error handling is included in the composed brigade.
It can make sense to use `compose` to wrap even a a single middleware function to obtain that error handling.

Calling compose with an empty list of middleware will create a middleware function that simply 
calls its `terminate` function.

## Calling a Brigade

There are three patterns for calling a brigade.  Two for starting a brigade, and one for choosing alternatives
while executing a brigade.

### Sentinel Response

Middleware is often used to organize complex request/response computations.  When both the request and response
can be complex, It makes sense to have objects represent both the request and the response. Many times, the 
 future response object is created at the same time as the request object, such as in node's http module.
 
In these cases, the "Sentinel Response" form can be used to begin a Brigade middleware chain

```js
import { callMiddleware, compose } from 'middleware-brigade'

function createHandler(middleware) {
  const brigade = compose(middleware);
  return handler;
  function handler(request, response) {
    return callMiddleware(brigade, request, response);
  }
}
```

The function `callMiddleware` will accept a pre-existing request and response object and begin calling each
middleware in the chain, creating `next` and `terminate` functions that properly continue control and return
the passed response object.

The advantage to this form is that since the response object is known in advance when the call chain is complete
a check can be made to ensure that the chain returns that exact object.  An error is raised if it does not.
This can detect many types of asynchronous failure modes. 

In this mode, every middleware in the chain receives the exact same request object and response object.

If you do not care what the end result of the middleware chain is, and also do not have a natural response object
for the sentinel response form, its recommended that still use the sentinel form and pass an empty object as the sentinel.
`callMiddleware(brigade, request, {})`

### Computed Response

If the response is not known in advance, but is being calculated by the middleware chain, `callMiddleware` should
be used without a response object.

```js
import { callMiddleware, compose } from 'middleware-brigade'

function createHandler(middleware) {
  const brigade = compose(middleware);
  return handler;
  function handler(request) {
    return callMiddleware(brigade, request);
  }
}
```

Brigade will check the end result of the chain and if it is `undefined`, an error will be raised.

Some failure modes cannot be detected using this form.

### Alternative Chaining

There are times when evaluating a middleware chain when it useful to make a decision and continue evaluating
different chains based on some condition.  For example, in routing middleware.  Since this case is continuing
and already executing chain and not begining a new chain, the calling form is slightly different.  Instead of
calling `callMiddleware`, just directly call a composed middleware brigade.  Using `compose` is recommended because
 of the error handling it adds.
 
```js
import { callMiddleware, compose } from 'middleware-brigade'

function createChoice(A, B) {
  const brigadeA = compose(A);
  const brigadeB = compose(B)
  return MiddlewareWithAlternatives;
  function MiddlewareWithAlternatives(request, next, terminate) {
    if (request.condition) {
      return brigadeA(request, next, terminate);
    } else {
      return brigadeB(request, next, terminate);
    }
  }
}
```

## Error Handling

TODO

## Failure modes

TODO

## Testing Middleware

TODO

## Library Goals

### Asynchronous

Unlike [connect](https://github.com/senchalabs/connect) style middleware and like [Koa](https://github.com/koajs/compose), Brigade middleware is asynchronous.  A middleware may allow the chain
to continue while continuing to process the request.

### Robust error detection and error messaging

Brigade values robust error detection and helpful error messaging.  Many of the features of the middleware signature
were chosen to enable this.

### Support writing middleware using typed JavaScript

Brigade includes flowtype type definitions.  Types can detect many types of errors, including errors which Brigade also
eplicitly checks for.  The advantage to type checking is that the error can be caught earlier, at development time.
This is an area where feedback is valued.

[Leave feedback on the type definitions](https://github.com/JeffRMoore/brigade/issues/1)

### Strict timing of the use of request and response

[Connect](https://github.com/senchalabs/connect) style middleware accepts both a `request` and `response` parameters and the middleware may modify the response
before continuing to the rest of the middleware chain, or after.  Brigade includes only the `request` parameter.  The
response  is acquired from downstream by calling the continue function (`next` or `terminate`).  This was done for two reasons.

First, if a middleware modifies the response before it gets passed down the chain, downstream middleware might not
know what modifications were made, so if something radical needs to be done to the response later, the state of the
response might contain a mixed state.  By only modifying response from the end of the chain upward, it is believed
the state will be more stable under more conditions.  Maybe.  This is an hypothesis and remains to be proven.

Second, forcing the middleware to acquire the response from calling `next` makes it more visible and less likely that
the chain of asynchronous operations will be unexpectedly broken.

Koa middleware uses a single `context` parameter that encapsulates both the request and response.  This style is also
usable with Brigade.

[Are there cases where response is needed prior to calling next?](https://github.com/JeffRMoore/brigade/issues/2)

### Explicit indication of intent to terminate

Its an accepted middleware pattern for a middleware to determine that it has fully handled a request and refuse to 
continue evaluation of the rest of the middleware chain.  In most middleware implementations, the middleware simply
returns without calling `next`.  In these cases it can be hard to determine if the intent was to not continue, or if
there was a programming error.  A comment might be added to indicate that the call to `next` was intentionally omitted.

Unlikely other middleware, Brigade uses passes two different continuation functions in its signature, `next` and 
`terminate`.  In Brigade `terminate` is called to indicate that the chain should terminate.  This makes the intent
clear to the reader of the code, eliminates the need for a comment, and allows for the detection of the unintentional
failure to continue the middleware chain.

Without the `terminate` parameter, the [Sentinel Response](#sentinel-response) pattern would not be possible since there would be no way for 
the middleware to acquire the sentinel to return it in the case where the middleware chain was being prematurely
terminated.

### ES6 Module support

Its the intent of Brigade to support es6 modules.  Currently babel is used.
I'm not sure what the best pattern is for deploying es6 modules to both node and browser
contexts.  Help wanted.

[What is the best way to use es6 modules with npm?](https://github.com/JeffRMoore/brigade/issues/3)

## Questions

### Why is the request required to be an object?

It is presumed that if the request were simple enough to not be an object, then also the middleware pattern would not be
required.  The restriction could be loosened.  Feedback is welcome.

### Why can't I swap out a different request object?

Every middleware would have to pass the request object it receives to its continuation function, or create a new request
object to pass.  This would be a source of errors.

### Why can't I swap out a different response object?

You should re-implement `callMiddleware` to better suit your use case.  This case was intentionally not supported to make
`callMiddleware` simpler.

## Acknowledgements

Brigade is based on [koa-compose](https://github.com/koajs/compose) and began as a pull request against that library.  Koa and Koa-compose are phenonominal works
of engineering.  However, some key goals of Brigade are not goals of Koa and it did not make sense to merge the PR,
given the turmoil that might cause relative to the possible benefits.  I released that work here to be able to use it
in other libraries.  I hope that someday this will become part of [Koa](https://github.com/koajs/koa).

## Contributing

[Help and feedback is welcome.](https://github.com/JeffRMoore/brigade/issues)