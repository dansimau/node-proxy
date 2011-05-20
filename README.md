# node-proxy

## About

node-proxy is a reverse caching web proxy that is designed to speed up slow web applications. It does this by serving out stale pages to clients while the object is refreshed in the background.

## Features

 * Disk/memory caching
 * Asychronous background refresh (clients are always served from cache)
 * Access logging

## Limitations

You can get a feel for the limitations by having a quick look at the [issue tracker](https://github.com/dansimau/node-proxy/issues).

## Requirements

 * Node.js 0.4.7
