# Mid Embeddings

This explores the midpoint of embeddings using centroid, reciprocal rank fusion, and more.

## Setting up

```sh
npm i
npm run setup
npx @convex-dev/auth
npx convex env set LLM_API_KEY # OpenAI API Key
npm run dev
```

## Setting up GitHub OAuth

Make a GitHub OAuth app:

`https://github.com/organizations/your-org-here/settings/applications`

Set the callback to `https://your-project-123.convex.site/api/auth/callback/github`
where you find your-project-123 in .env.local.

```sh
npx convex env set AUTH_GITHUB_ID # GitHub OAuth ID
npx convex env set AUTH_GITHUB_SECRET # GitHub OAuth Secret
```

To configure different authentication methods, see [Configuration](https://labs.convex.dev/auth/config) in the Convex Auth docs.
