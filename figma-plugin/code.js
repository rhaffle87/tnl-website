// TNL Studio CMS Sync - Figma Plugin Sandbox Worker
// Runs inside the Figma main thread sandbox with access to figma.* APIs

figma.showUI(__html__, { width: 380, height: 550, themeColors: true });

function rgbToHex(r, g, b) {
  const toHex = (c) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function extractNodeData(node) {
  if (!node) return null;
  const data = {
    id: node.id,
    name: node.name,
    type: node.type,
    text: node.type === "TEXT" ? node.characters : undefined,
  };

  if ("children" in node && node.children.length > 0) {
    data.children = node.children.map(extractNodeData);
  }
  return data;
}

function sendSelection() {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.ui.postMessage({ type: "selection-changed", hasSelection: false });
    return;
  }

  const primary = selection[0];
  const texts = [];

  function collectTexts(n) {
    if (n.type === "TEXT" && n.characters.trim()) {
      texts.push(n.characters.trim());
    }
    if ("children" in n) {
      n.children.forEach(collectTexts);
    }
  }
  collectTexts(primary);

  figma.ui.postMessage({
    type: "selection-changed",
    hasSelection: true,
    node: {
      id: primary.id,
      name: primary.name,
      type: primary.type,
      width: Math.round(primary.width),
      height: Math.round(primary.height),
      heading: texts[0] || primary.name,
      subheading: texts[1] || "",
      allTexts: texts,
    },
  });
}

// Initial selection notification
sendSelection();

// Listen to selection changes in the canvas
figma.on("selectionchange", () => {
  sendSelection();
});

// Message handler from UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === "get-variables") {
    try {
      if (!figma.variables || !figma.variables.getLocalVariablesAsync) {
        figma.ui.postMessage({
          type: "variables-result",
          ok: false,
          error: "Figma Variables API not available in this Figma version.",
        });
        return;
      }

      const variables = await figma.variables.getLocalVariablesAsync("COLOR");
      const tokens = {};

      for (const v of variables) {
        // Look up values for first available mode
        const valuesByMode = v.valuesByMode;
        const modeKeys = Object.keys(valuesByMode);
        if (modeKeys.length > 0) {
          const val = valuesByMode[modeKeys[0]];
          if (val && typeof val.r === "number") {
            const hex = rgbToHex(val.r, val.g, val.b);
            const cleanName = v.name.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
            tokens[cleanName] = hex;
          }
        }
      }

      figma.ui.postMessage({
        type: "variables-result",
        ok: true,
        tokens,
        count: Object.keys(tokens).length,
      });
    } catch (err) {
      figma.ui.postMessage({
        type: "variables-result",
        ok: false,
        error: String(err),
      });
    }
  } else if (msg.type === "notify") {
    figma.notify(msg.message, { error: Boolean(msg.error) });
  } else if (msg.type === "close") {
    figma.closePlugin();
  }
};
