# 🇧🇯 Benin Official Laws MCP Server

An MCP (Model Context Protocol) server providing access to the official laws of the Republic of Benin, directly from verified government sources.

---

## 💬 Exemples de conversations

**Recherche :**
> "Quelles sont les lois béninoises sur la propriété foncière ?"

**Compréhension :**
> "Explique-moi en termes simples le code du travail béninois concernant les congés payés"

**Droits spécifiques :**
> "Mon employeur veut me licencier. Quels sont mes droits selon la loi béninoise ?"

**Numéro précis :**
> "Cherche la loi N°2015-18 sur la fonction publique"

**Domaine :**
> "Quelles lois régissent les sociétés commerciales au Bénin ?"

---

## 🔒 Reliability & Trust

- ✅ **Official Government Sources Only**: Fetches data exclusively from official portals (legis.cdij.bj, sgg.gouv.bj).
- ✅ **Citations Included**: Every response includes the source and the direct URL of the consulted law.
- ✅ **No Hallucination**: The server reads raw official texts; it does not "invent" or guess legal information.
- ✅ **No Cache**: Real-time access to ensure you get the most up-to-date legal data.
- ❌ **Automatic Rejection**: Refuses any non-official or third-party URLs to maintain legal accuracy.

---

## 🚀 Installation & Usage

As it follows the **Model Context Protocol (MCP)**, this server is compatible with any MCP client (Claude Desktop, Cursor, Zed, Sourcegraph Cody, etc.).

You can use this server directly via `npx`:

```bash
npx -y @djedjedigital/benin-lois-mcp
```

### Client Configuration

#### Claude Desktop
Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "benin-lois": {
      "command": "npx",
      "args": ["-y", "@djedjedigital/benin-lois-mcp"]
    }
  }
}
```

#### Other Clients (Cursor, Antigravity, Gemini CLI, etc.)
Simply add the server using the `npx` command as the entry point:
- **Command**: `npx`
- **Arguments**: `-y`, `@djedjedigital/benin-lois-mcp`

---

## 📄 License

This project is a tool for accessing official public data.
The legal texts themselves belong to the Republic of Benin.
Code released under the [MIT License](LICENSE).
