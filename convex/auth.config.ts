const d = new URL(process.env.CONVEX_SITE_URL!);
d.protocol = "https:";
export default {
  providers: [
    {
      domain: d.toString(),
      applicationID: "convex",
    },
  ],
};
