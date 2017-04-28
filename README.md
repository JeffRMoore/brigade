# Middleware Brigade

_Middleware Brigade_ is a library for composing and calling middleware.  Middleware is a pattern
for using a series of semi-independent modules to accomplish a goal or compute a result.
Each module is called a middleware and has a standard function signature and receives data in a 
standard format.  The middleware then processes the data and passes control to the next middleware
in the chain. 

_Middleware Brigade_ is named after the concept of a [Bucket Brigade](https://en.wikipedia.org/wiki/Bucket_brigade)

A _brigade_ is an ordered list of _middleware functions_, usually an `Array`.
A _middleware function_ is any function conforming to the _Middleware Brigade_ function signature and contract.
A _composed brigade_ is a _middleware function_ that calls each _middleware function_ in a _brigade_ in series and coordinates
communications between them as well as error handling.
_Middleware Brigade_ is a library for producing and calling _composed brigades_.

## Middleware Brigade middleware signature

A _Middleware Brigade_ _middleware function_ is always asynchronous.  If javascript [`async`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function) functions are used, it has the following signature:

```js
async function middleware(request, next, terminate) {
  
}
```

or, alternatively, a `Promise` object can be explicitly returned from a standard synchronous JavaScript function:

```js
function middleware(request, next, terminate) {
  return Promise.reject(new Error('Failure'));  
}
```

`request` is an object that represents the data that the _middleware function_ operates on.

`next` and `terminate` are functions that determine how the rest of the middleware chain is processed.
These are known as _continue functions_.  The middleware function MUST call either `next` or `terminate`, or throw an error
 or return a rejected promise.

if `next` is called, then control is passed to the next middleware in the _brigade_, which will receive the
same `request` object.

```js
async function middleware(request, next, terminate) {
  result = await next();
  // slightly redundant for clarity.
  return result;
}
```

if `terminate` is called, the _middleware function_ will be considered the end of the _brigade_ and
no further middleware will be called in this _brigade_.

Both `next` and `terminate` are asynchronous functions and their return values must be appropriately processed.
In the prior example, an `async` function, `await` can be used to wait for the return value, which should
be returned from the middleware.

If the `Promise` form is used, the promise returned by `next` or `terminate` can be directly used or returned.

```js
function middleware(request, next, terminate) {
  return next().then(result => { /* stuff */ return result; });
}
```

Most _middleware functions_ will call `next`, so declaring the `terminate` parameter is optional.

```js
function middleware(request, next) {
  return next().then(result => { /* stuff */ return result; });
}
```

Each _middleware function_ must return either a rejected promise indicating an error or a promise that resolves to the
result of the _brigade_.  Usually, the result is simply received from calling `next` or `terminate`,
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

## Composing a brigade

An array of _middleware functions_ can be composed into a single middleware function known as a  _composed brigade_.  A 
a _composed brigade_ has the _middleware function_ signature and can itself be composed into another 
_composed brigade_, or called directly.

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

When _middleware functions_ are composed into a _composed brigade_, error handling is included in the resulting _middleware
function_.  It can make sense to use `compose` to wrap even a a single _middleware function_ to obtain that error handling.

Calling `compose` with an empty list will create a _middleware function_ that simply 
calls its `next` function.

## Calling a brigade

There are three conventions in _Middleware Brigade_ for calling a _middleware function_.  Two for starting a 
_composed brigade_, and one for choosing alternatives while executing a _composed brigade_.

### Sentinel Response

The middleware pattern is often used to organize complex request/response computations.  When both the request and response
can be complex, It makes sense to have objects represent both the request and the response. Many times, the 
 future response object is created at the same time as the request object, such as in node's http module.
 
In these cases, the _Sentinel Response_ form can be used to begin a _Brigade_.

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
This can detect many types of asynchronous [failure modes](https://github.com/JeffRMoore/brigade#failure-modes). 

In this form, every middleware in the _brigade_ receives the exact same request object and response object.

If you do not care what the end result of the _brigade_ is, and also do not have a natural response object
for the _sentinel response_ form, its recommended that still use the _sentinel response_ form and pass an empty object as the sentinel.
`callMiddleware(brigade, request, {})`

### Computed Response

If the response is not known in advance, but is being calculated by the _brigade_, `callMiddleware` should
be used without passing a response object.

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

_Middleware Brigade_ will check the end result of the _brigade_ and if it is `undefined`, an error will be raised.

Some [failure modes](https://github.com/JeffRMoore/brigade#failure-modes) cannot be detected using this form.

### Alternative Chaining

There are times when evaluating a _brigade_ when it useful to make a decision and continue evaluating
different _brigades_ based on some condition.  For example, in routing middleware.  Since this case is continuing
an already executing _brigade_ and not beginning a new _brigade_, the calling form is slightly different.  Instead of
calling `callMiddleware`, just directly call a _composed middleware_ representing the  _brigade_.  Using `compose` is recommended because
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

In `async` _middleware functions_, errors from calling the _continue function_ will be
registered as exceptions.  JavaScript will automatically convert rejected promises to
exceptions.  The errors can be handled with `try` and `catch`.

```js
async function middleware(request, next, terminate) {
  try {
    const result = await next();
  } catch (e) {
    handleError(e);
  }
  return result;
}
```

Errors can be raised by using `throw`.

```js
async function middleware(request, next, terminate) {
  throw new Error('Always Fails');
}
```

In a standard function returning a promise, the [`catch`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/catch) method should be used.

```js
async function middleware(request, next, terminate) {
  return next().catch( err => handleError(e));
}

```

Returns a rejected promise to raise an error.

```js
async function middleware(request, next, terminate) {
  return Promise.reject('Always Fails');
}
```

## Failure modes

_Middleware Brigade_ middleware is asynchronous and uses Promises to coordinate code that runs at different times.
(Under the hood, JavaScript's `async` functions map to promises.)  The biggest failure mode with
_Middleware Brigade_ is failing to chain together the promise received from calling `next` or `terminate` with
the promise returned by the _middleware function_.  Much of the structure of _Middlware Brigade_ is meant to prevent or detect that.


### Failure to use the result of calling next

An `async` function always returns a promise. Any value that is returned is wrapped in a `Promise`.
If no return value is specified, a Promise resolving to `undefined` will be returned.

For example, this _middleware function_ has no connection between the Promise returned by `next` and the 
implicit Promise created by javascript when `badExample` finishes executing.

```js
function badExample(request, next, terminate) {
  next();
}
```

This can be re-written as 

```js
function goodExample(request, next, terminate) {
  return next();
}
```

### Failure to use await in an async function

This example returns a promise, but does not wait for its result.  `await` is required to halt execution
 until the remainder of the chain is complete.  The following example will execute in an
 unexpected order.  `doSomething` may execute before logic specified by `next`.

```js
function badExample(request, next, terminate) {
  const result = next();
  doSomething();
  return result;
}
```

Adding `await` makes the execution order deterministic.

```js
function goodExample(request, next, terminate) {
  const result = await next();
  doSomething();
  return result;
}
```

## Testing Middleware

When writing tests for _middleware functions_, please remember to write a test case where the _continue function_
method used ()`next` or `terminate`) completes with an expected result object, as well as when
it completes with a rejected Promise.

## Library Goals

### Asynchronous

Unlike [connect](https://github.com/senchalabs/connect) style middleware and like [Koa](https://github.com/koajs/compose), _Middlware Brigade_ middleware is asynchronous.  
A _middleware function_ may allow the chain to continue while continuing to process the request.

### Robust error detection and error messaging

_Middleware Brigade_ values robust error detection and helpful error messaging.  Many of the features of the 
_middleware function_ signature were chosen to enable this.

### Support writing middleware using typed JavaScript

_Middleware Brigade_ includes [flowtype](https://flow.org) type definitions.  Types can detect many types of errors, including errors which 
_Middlware Brigade_ also eplicitly checks for.  The advantage to type checking is that the error can be caught earlier, at development time.

[Leave feedback on the type definitions](https://github.com/JeffRMoore/brigade/issues/1)

### Strict timing of the use of request and response

[Connect](https://github.com/senchalabs/connect) style middleware accepts both a `request` and `response` parameters and the middleware may modify the response
before continuing to the rest of the middleware chain, or after.  _Middleware Brigade_ includes only the `request` parameter.  The
response  is acquired from the rest of the _brigade_ by calling the _continue function_ (`next` or `terminate`).  
This was done for two reasons.

First, if a _middleware function_ modifies the response before it gets passed down the chain, _middleware functions_
later in the _brigade_ might not
know what modifications were made, so if something radical needs to be done to the response later, the state of the
response might contain a mixed state.  By only modifying response from the end of the _brigade_ toward the beginning, 
it is believed the state will be more stable under more conditions.  Maybe.  This is an hypothesis and remains to be proven.

Second, forcing the _middleware function_ to acquire the response from calling `next` makes it more visible and less likely that
the chain of asynchronous operations will be unexpectedly broken.

Koa middleware uses a single `context` parameter that encapsulates both the request and response.  This style is also
usable with _Middleware Brigade_ by attaching the response object to the request object. (And possibly vise-versa.)

[Are there cases where response is needed prior to calling next?](https://github.com/JeffRMoore/brigade/issues/2)

### Explicit indication of intent to terminate

Its an accepted middleware pattern for a _middleware function_ to determine that it has fully handled a request and refuse to 
continue evaluation of the rest of the _brigade_.  In most middleware implementations, the middleware simply
returns without calling `next`.  In these cases it can be hard to determine if the intent was to not continue, or if
there was a programming error.  A comment might be added to indicate that the call to `next` was intentionally omitted.

Unlikely other middleware, _Middleware Brigade_ uses passes two different _continue functions_ in its signature, `next` and 
`terminate`.  In _Middleware Brigade_ `terminate` is called to indicate that the brigade should terminate.  This makes the intent
clear to the reader of the code, eliminates the need for a comment, and allows for the detection of the unintentional
failure to pass control down the _brigade_.

Without the `terminate` parameter, the [Sentinel Response](#sentinel-response) pattern would not be possible since there 
would be no standard way for the _middleware function_ to acquire the sentinel to return it in the case where the _brigade_ 
was being prematurely terminated.

### ES6 Module support

Its the intent of _Middlware Brigade_ to support es6 modules.  Currently babel is used.
I'm not sure what the best pattern is for deploying es6 modules to both node and browser
contexts.  Help wanted.

[What is the best way to use es6 modules with npm?](https://github.com/JeffRMoore/brigade/issues/3)

## Questions

### Why is the request required to be an object?

It is presumed that if the request were simple enough to not be an object, then also the middleware pattern would not be
required.  The restriction could be loosened.  Feedback is welcome.

### Why can't I swap out a different request object?

Every _middleware function_ would have to pass the request object it receives to its continuation function, or create a new request
object to pass.  This would be a source of errors.

### Why can't I swap out a different response object?

You should re-implement `callMiddleware` to better suit your use case.  This case was intentionally not supported to make
`callMiddleware` simpler.

## Contributing

[Help and feedback is welcome.](https://github.com/JeffRMoore/brigade/issues)

## Acknowledgements

_Middlware Brigade_ is based on [koa-compose](https://github.com/koajs/compose) and began as a pull request against that library.
Koa and Koa-compose are phenonominal works of engineering.  However, some goals of _Middleware Brigade_ are not goals of Koa 
and it did not make sense to merge the PR in the context of Koa's goals, especially when the benefit remains unproven and would
possibly involve a traumatic BC break for Koa.  I released that work here to be able to use it in other contexts and get a 
sense of whether there is a value in those choices.  I hope whatever proves of value here will make it back to Koa.