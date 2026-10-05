# @stdx/http

[![JSR](https://jsr.io/badges/@stdx/http)](https://jsr.io/@stdx/http)
[![JSR Score](https://jsr.io/badges/@stdx/http/score)](https://jsr.io/@stdx/http)
[![Weekly downloads](https://jsr.io/badges/@stdx/http/weekly-downloads)](https://jsr.io/@stdx/http)
[![Total downloads](https://jsr.io/badges/@stdx/http/total-downloads)](https://jsr.io/@stdx/http)

Extends [@std/http](https://jsr.io/@std/http)

The HTTP package contains utilities for fetch and HTTP functions. The constants
are generated from the IANA registries, so they stay complete and typed.

## Entrypoints

### Header

The header module contains helpers for HTTP headers such as the IANA HTTP
headers. `HttpHeader` is a constant of all header names, and a type of their
values.

```ts
import { HttpHeader } from "@stdx/http/header";

const headers = new Headers({ [HttpHeader.ContentType]: "application/json" });
headers.get(HttpHeader.ContentType); // "application/json"
```

### Method

The method module contains helpers for HTTP methods such as the IANA HTTP
methods. `HttpMethod` is a constant of all methods, and a type of their values.

```ts
import { HttpMethod } from "@stdx/http/method";

const request = new Request("https://example.com", {
  method: HttpMethod.Post,
});
request.method; // "POST"
```
