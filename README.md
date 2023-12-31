This is an attempt to create a shadow map in 2D.

## Quick start

```
npm install
npm run watch
```

Now run a static web server in a separate terminal window that serves files
out of the repository's root directory, e.g. via `npx http-server`, and
visit it.

### Deployment

Run `npm run build-js` followed by `sh ./copy-to-dist.sh` to build everything
for deployment, then upload the `dist` directory to a static web server.

You can also run `npm run build-and-deploy` to deploy everything to GitHub 
Pages.

## License

Everything in this repository, including the Rust code and the Blender project, is licensed under [CC0 1.0 Universal](./LICENSE.md) (public domain).

## References

* [Wikipedia's Shadow Mapping page](https://en.wikipedia.org/wiki/Shadow_mapping) - A good overview of the process.

* [Casting curved shadows on curved surfaces](https://cseweb.ucsd.edu//~ravir/274/15/papers/p270-williams.pdf) - Original 1978 paper by Lance Williams.
