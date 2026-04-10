#!/usr/bin/env node
/**
 * MCP Server — Lois Officielles du Bénin
 * Source: legis.cdij.bj (CDIJ / Ministère de la Justice)
 *
 * Outils exposés :
 *   1. rechercher_lois        — Recherche par mot-clé / thème
 *   2. lire_loi               — Récupère le texte complet d'une loi
 *   3. lister_domaines        — Liste tous les domaines juridiques
 *   4. lois_recentes          — Dernières lois promulguées
 *   5. loi_par_numero         — Accès direct par numéro de loi
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

// ─── Configuration ────────────────────────────────────────────────────────────
const BASE_URL = "https://legis.cdij.bj";
const SGG_URL  = "https://sgg.gouv.bj";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; BeninLoisMCP/1.0; +https://github.com/benin-lois-mcp)",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

// Domaines juridiques connus sur legis.cdij.bj
const DOMAINES = {
  "constitution":        { label: "Droit Constitutionnel",     slug: "constitution" },
  "travail":             { label: "Droit du Travail",           slug: "travail" },
  "famille":             { label: "Droit de la Famille",        slug: "famille" },
  "foncier":             { label: "Droit Foncier / Immobilier", slug: "foncier" },
  "commerce":            { label: "Droit des Affaires",         slug: "commerce" },
  "penal":               { label: "Droit Pénal",                slug: "penal" },
  "sante":               { label: "Santé Publique",             slug: "sante" },
  "education":           { label: "Éducation",                  slug: "education" },
  "environnement":       { label: "Environnement",              slug: "environnement" },
  "fonction-publique":   { label: "Fonction Publique",          slug: "fonction-publique" },
  "finances":            { label: "Finances Publiques",         slug: "finances" },
  "numerique":           { label: "Numérique / TIC",            slug: "numerique" },
  "agriculture":         { label: "Agriculture",                slug: "agriculture" },
  "transport":           { label: "Transport",                  slug: "transport" },
  "securite":            { label: "Sécurité Intérieure",        slug: "securite" },
};

// ─── Utilitaires HTTP ─────────────────────────────────────────────────────────
async function fetchHTML(url) {
  const res = await fetch(url, { headers: HEADERS, timeout: 15000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  return await res.text();
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { ...HEADERS, "Accept": "application/json" }, timeout: 15000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  return await res.json();
}

// ─── Scrapers ─────────────────────────────────────────────────────────────────

/**
 * Scrape la liste des lois depuis legis.cdij.bj/lois-promulguees
 */
async function scrapeListeLois(page = 1) {
  const url = `${BASE_URL}/lois-promulguees?page=${page}`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);
  const lois = [];

  // Chaque carte loi
  $(".card, article, .loi-item, [class*='loi']").each((_, el) => {
    const $el = $(el);
    const titre  = $el.find("h2, h3, .titre, .title").first().text().trim();
    const numero = $el.find(".numero, .ref, [class*='num']").first().text().trim()
                   || titre.match(/N°[\s\d\-]+/i)?.[0] || "";
    const date   = $el.find(".date, time").first().text().trim()
                   || $el.find("[datetime]").attr("datetime") || "";
    const href   = $el.find("a[href*='/loi'], a[href*='/open'], a[href*='/download']").first().attr("href") || "";
    const lireUrl = href ? (href.startsWith("http") ? href : BASE_URL + href) : "";

    if (titre) {
      lois.push({ numero, titre, date, url: lireUrl, source: url });
    }
  });

  // Fallback : lire depuis les liens directs
  if (lois.length === 0) {
    $("a[href]").each((_, el) => {
      const href  = $(el).attr("href") || "";
      const texte = $(el).text().trim();
      if ((href.includes("/loi") || href.includes("open") || href.includes("download")) && texte.length > 10) {
        lois.push({
          numero: texte.match(/N°[\s\d\-]+/i)?.[0] || "",
          titre: texte,
          date: "",
          url: href.startsWith("http") ? href : BASE_URL + href,
          source: url,
        });
      }
    });
  }

  return lois;
}

/**
 * Recherche fulltext sur legis.cdij.bj
 */
async function rechercherSurLegis(motsCles) {
  const query = encodeURIComponent(motsCles);
  const url   = `${BASE_URL}/lois-promulguees?search=${query}`;
  const html  = await fetchHTML(url);
  const $     = cheerio.load(html);
  const lois  = [];

  // Parser les résultats
  $("h2 a, h3 a, .card a, article a").each((_, el) => {
    const $el  = $(el);
    const href = $el.attr("href") || "";
    const texte = $el.text().trim();
    if (texte.length > 8 && (href.includes("loi") || href.includes("open"))) {
      const lienComplet = href.startsWith("http") ? href : BASE_URL + href;
      lois.push({
        titre: texte,
        numero: texte.match(/N°[\s\d\-\/]+/i)?.[0]?.trim() || "",
        url: lienComplet,
        source: "legis.cdij.bj",
      });
    }
  });

  // Fallback: texte brut de la page
  if (lois.length === 0) {
    const texte = $("body").text();
    const lignes = texte.split("\n").filter(l => l.includes("Loi") || l.includes("N°"));
    lignes.slice(0, 10).forEach(l => {
      const propre = l.trim();
      if (propre.length > 15) {
        lois.push({
          titre: propre,
          numero: propre.match(/N°[\s\d\-\/]+/i)?.[0]?.trim() || "",
          url: url,
          source: "legis.cdij.bj",
        });
      }
    });
  }

  return lois.slice(0, 15);
}

/**
 * Récupère le contenu textuel d'une loi (depuis son URL PDF/page)
 */
async function lireContenuLoi(urlLoi) {
  const html = await fetchHTML(urlLoi);
  const $ = cheerio.load(html);

  // Supprimer navigation / pied de page
  $("nav, footer, header, script, style, .menu, .navbar").remove();

  const titre   = $("h1, h2").first().text().trim();
  const contenu = $("main, article, .content, .loi-content, body").first().text()
    .replace(/\s{3,}/g, "\n\n")
    .trim()
    .slice(0, 8000); // Limite raisonnable

  return { titre, contenu, urlSource: urlLoi };
}

// ─── Définition des outils MCP ────────────────────────────────────────────────
const TOOLS = [
  {
    name: "rechercher_lois",
    description: `Recherche des lois officielles béninoises par mots-clés, sujet ou domaine juridique.
Retourne une liste de lois avec leurs numéros officiels et liens vers legis.cdij.bj.
Exemples : "contrat de travail", "mariage divorce", "permis construire", "code pénal"`,
    inputSchema: {
      type: "object",
      properties: {
        mots_cles: {
          type: "string",
          description: "Mots-clés ou sujet à rechercher (ex: 'droit foncier', 'licenciement', 'sociétés commerciales')",
        },
        domaine: {
          type: "string",
          description: "Filtrer par domaine : constitution, travail, famille, foncier, commerce, penal, sante, education, environnement, fonction-publique, finances, numerique",
          enum: Object.keys(DOMAINES),
        },
        page: {
          type: "integer",
          description: "Numéro de page des résultats (défaut: 1)",
          default: 1,
        },
      },
      required: ["mots_cles"],
    },
  },
  {
    name: "lire_loi",
    description: `Récupère et retourne le texte complet d'une loi béninoise depuis legis.cdij.bj.
Nécessite l'URL directe de la loi (obtenue via rechercher_lois).
Retourne le texte officiel avec la référence de source.`,
    inputSchema: {
      type: "object",
      properties: {
        url_loi: {
          type: "string",
          description: "URL directe de la loi sur legis.cdij.bj (ex: https://legis.cdij.bj/XXXX/open)",
        },
      },
      required: ["url_loi"],
    },
  },

  {
    name: "lister_domaines",
    description: "Liste tous les domaines juridiques disponibles (travail, famille, foncier, commerce, pénal, etc.) avec description.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "lois_recentes",
    description: "Retourne les dernières lois promulguées au Bénin, classées par date de publication sur legis.cdij.bj.",
    inputSchema: {
      type: "object",
      properties: {
        nombre: {
          type: "integer",
          description: "Nombre de lois à retourner (défaut: 10, max: 30)",
          default: 10,
        },
      },
    },
  },
  {
    name: "loi_par_numero",
    description: `Recherche une loi précise par son numéro officiel (ex: "2017-05", "90-028", "2020-23").
Retourne le lien direct et les métadonnées officielles.`,
    inputSchema: {
      type: "object",
      properties: {
        numero: {
          type: "string",
          description: "Numéro de la loi (ex: '2017-05', 'N°2020-23', '86-013')",
        },
      },
      required: ["numero"],
    },
  },
];

// ─── Handlers des outils ──────────────────────────────────────────────────────
async function handleRechercherLois({ mots_cles, domaine, page = 1 }) {
  try {
    let resultats = await rechercherSurLegis(mots_cles);

    // Filtrage domaine si spécifié
    if (domaine && DOMAINES[domaine]) {
      const domaineLabel = DOMAINES[domaine].label.toLowerCase();
      resultats = resultats.filter(l =>
        l.titre.toLowerCase().includes(domaine) ||
        l.titre.toLowerCase().includes(domaineLabel.split(" ").pop())
      );
    }

    if (resultats.length === 0) {
      return {
        content: [{
          type: "text",
          text: `Aucune loi trouvée pour "${mots_cles}".\n\n` +
                `Suggestions :\n` +
                `- Essayez des mots-clés plus généraux\n` +
                `- Consultez directement : ${BASE_URL}/lois-promulguees\n` +
                `- Ou le SGG : ${SGG_URL}`,
        }],
      };
    }

    const lignes = resultats.map((l, i) => {
      const num  = l.numero ? `[${l.numero}] ` : "";
      const date = l.date   ? ` — ${l.date}`   : "";
      const lien = l.url    ? `\n   🔗 ${l.url}` : "";
      return `${i + 1}. ${num}${l.titre}${date}${lien}`;
    }).join("\n\n");

    return {
      content: [{
        type: "text",
        text: `📋 **${resultats.length} loi(s) trouvée(s) pour "${mots_cles}"**\n` +
              `Source officielle : legis.cdij.bj (CDIJ / Ministère de la Justice)\n\n` +
              lignes +
              `\n\n💡 Utilisez l'outil \`lire_loi\` avec une URL pour obtenir le texte complet de la loi.`,
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `Erreur lors de la recherche : ${err.message}\n` +
              `Consultez directement : ${BASE_URL}/lois-promulguees`,
      }],
      isError: true,
    };
  }
}

async function handleLireLoi({ url_loi }) {
  if (!url_loi.startsWith("https://legis.cdij.bj") && !url_loi.startsWith("https://sgg.gouv.bj")) {
    return {
      content: [{
        type: "text",
        text: `⚠️ URL non autorisée. Seules les sources officielles sont acceptées :\n` +
              `- legis.cdij.bj\n- sgg.gouv.bj`,
      }],
      isError: true,
    };
  }

  try {
    const { titre, contenu, urlSource } = await lireContenuLoi(url_loi);
    return {
      content: [{
        type: "text",
        text: `📄 **${titre || "Texte de loi officiel"}**\n` +
              `🔗 Source : ${urlSource}\n` +
              `📌 CDIJ — Ministère de la Justice et de la Législation, République du Bénin\n\n` +
              `─────────────────────────────\n\n` +
              contenu,
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `Impossible de charger la loi : ${err.message}\n` +
              `Accédez directement : ${url_loi}`,
      }],
      isError: true,
    };
  }
}



async function handleListerDomaines() {
  const lignes = Object.entries(DOMAINES).map(([cle, d]) =>
    `• **${d.label}** — clé: \`${cle}\``
  ).join("\n");

  return {
    content: [{
      type: "text",
      text: `📚 **Domaines juridiques disponibles — Droit béninois**\n` +
            `Source : legis.cdij.bj (CDIJ / Ministère de la Justice)\n\n` +
            lignes +
            `\n\n💡 Utilisez ces clés dans l'outil \`rechercher_lois\` (paramètre \`domaine\`).\n` +
            `Exemple : rechercher_lois({ mots_cles: "licenciement", domaine: "travail" })`,
    }],
  };
}

async function handleLoisRecentes({ nombre = 10 }) {
  try {
    const lois = await scrapeListeLois(1);
    const selection = lois.slice(0, Math.min(nombre, 30));

    if (selection.length === 0) {
      return {
        content: [{
          type: "text",
          text: `Impossible de récupérer les lois récentes.\n` +
                `Consultez directement : ${BASE_URL}/lois-promulguees`,
        }],
      };
    }

    const lignes = selection.map((l, i) => {
      const num  = l.numero ? `[${l.numero}] ` : "";
      const date = l.date   ? ` — ${l.date}`   : "";
      const lien = l.url    ? `\n   🔗 ${l.url}` : "";
      return `${i + 1}. ${num}${l.titre}${date}${lien}`;
    }).join("\n\n");

    return {
      content: [{
        type: "text",
        text: `🆕 **Dernières lois promulguées au Bénin**\n` +
              `Source : legis.cdij.bj — CDIJ, Ministère de la Justice\n\n` +
              lignes,
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `Erreur : ${err.message}\nSource directe : ${BASE_URL}/lois-promulguees`,
      }],
      isError: true,
    };
  }
}

async function handleLoiParNumero({ numero }) {
  const numeroNettoye = numero.replace(/^N°\s*/i, "").trim();
  try {
    const resultats = await rechercherSurLegis(numeroNettoye);

    const exacts = resultats.filter(l =>
      l.titre.includes(numeroNettoye) ||
      l.numero?.includes(numeroNettoye)
    );

    const liste = exacts.length > 0 ? exacts : resultats.slice(0, 5);

    if (liste.length === 0) {
      return {
        content: [{
          type: "text",
          text: `Loi N°${numeroNettoye} introuvable dans la base.\n\n` +
                `Suggestions :\n` +
                `- Vérifiez le numéro exact sur ${BASE_URL}/lois-promulguees\n` +
                `- Ou consultez le SGG : ${SGG_URL}`,
        }],
      };
    }

    const lignes = liste.map((l, i) => {
      const lien = l.url ? `\n   🔗 ${l.url}` : "";
      const date = l.date ? ` — ${l.date}` : "";
      return `${i + 1}. ${l.titre}${date}${lien}`;
    }).join("\n\n");

    return {
      content: [{
        type: "text",
        text: `🔍 **Résultats pour loi N°${numeroNettoye}**\n` +
              `Source : legis.cdij.bj\n\n` + lignes,
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `Erreur : ${err.message}`,
      }],
      isError: true,
    };
  }
}

// ─── Serveur MCP ──────────────────────────────────────────────────────────────
const server = new Server(
  {
    name: "benin-lois-mcp",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {} },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "rechercher_lois":   return await handleRechercherLois(args);
    case "lire_loi":          return await handleLireLoi(args);

    case "lister_domaines":   return await handleListerDomaines();
    case "lois_recentes":     return await handleLoisRecentes(args);
    case "loi_par_numero":    return await handleLoiParNumero(args);
    default:
      return {
        content: [{ type: "text", text: `Outil inconnu : ${name}` }],
        isError: true,
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✅ MCP Lois Bénin démarré — Source : legis.cdij.bj");
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
