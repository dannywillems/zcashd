import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const ZCASH_PIN = "v5.5.0-rc1";
const UPSTREAM_REPO = "https://github.com/zcash/zcash";
const FORK_REPO = "https://github.com/dannywillems/zcashd";
const FORK_BRANCH = "onboarding";

const config: Config = {
  title: "zcashd onboarding",
  tagline: "Graduate-level guide to the zcashd codebase",
  favicon: "img/favicon.ico",

  url: "https://dannywillems.github.io",
  baseUrl: "/zcashd/",

  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",

  markdown: {
    format: "detect",
    mermaid: false,
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/",
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
          editUrl: `${FORK_REPO}/edit/${FORK_BRANCH}/onboarding/`,
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  stylesheets: [
    {
      href: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css",
      type: "text/css",
      integrity:
        "sha384-nB0miv6/jRmo5EGIE6RDQE0etf4GvjBR1bkf4pcUk2TprLGa0k7/rJkRnCu6WSt6",
      crossorigin: "anonymous",
    },
  ],

  themes: [
    [
      "@easyops-cn/docusaurus-search-local",
      {
        hashed: true,
        indexDocs: true,
        indexBlog: false,
        indexPages: true,
        language: ["en"],
        highlightSearchTermsOnTargetPage: true,
      },
    ],
    "docusaurus-theme-github-codeblock",
  ],

  themeConfig: {
    announcementBar: {
      id: "ai-generated-disclaimer",
      content:
        'This site is automatically generated using Claude Code. Errors may have been introduced. The code is the law, always refer to the source in the <a href="https://github.com/zcash/librustzcash">librustzcash workspace</a>.',
      backgroundColor: "#fef3c7",
      textColor: "#78350f",
      isCloseable: false,
    },
    colorMode: {
      respectPrefersColorScheme: true,
    },
    codeblock: {
      showGithubLink: true,
      githubLinkLabel: "View on GitHub",
      showRunmeLink: false,
    },
    navbar: {
      title: "zcashd onboarding",
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Course",
        },
        {
          href: `${FORK_REPO}/tree/${FORK_BRANCH}/onboarding`,
          label: "Source",
          position: "right",
        },
        {
          href: UPSTREAM_REPO,
          label: "zcash/zcash",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "This course",
          items: [
            {
              label: "Source on GitHub",
              href: `${FORK_REPO}/tree/${FORK_BRANCH}/onboarding`,
            },
            {
              label: "Open an issue",
              href: `${FORK_REPO}/issues`,
            },
          ],
        },
        {
          title: "Upstream",
          items: [
            {
              label: "zcash/zcash",
              href: UPSTREAM_REPO,
            },
            {
              label: `Pinned tag: ${ZCASH_PIN}`,
              href: `${UPSTREAM_REPO}/tree/${ZCASH_PIN}`,
            },
            {
              label: "librustzcash",
              href: "https://github.com/zcash/librustzcash",
            },
          ],
        },
        {
          title: "Authoritative references",
          items: [
            {
              label: "Zcash Protocol Specification",
              href: "https://zips.z.cash/protocol/protocol.pdf",
            },
            {
              label: "ZIPs index",
              href: "https://zips.z.cash/",
            },
            {
              label: "Halo 2 book",
              href: "https://zcash.github.io/halo2/",
            },
            {
              label: "Orchard book",
              href: "https://zcash.github.io/orchard/",
            },
          ],
        },
      ],
      copyright: `zcashd onboarding course. Source pinned at ${ZCASH_PIN}.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: [
        "bash",
        "cpp",
        "rust",
        "toml",
        "json",
        "python",
        "yaml",
        "diff",
        "makefile",
      ],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
