"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // src/main.ts
  var require_main = __commonJS({
    "src/main.ts"(exports) {
      var componentMap = /* @__PURE__ */ new Map();
      var varValues = /* @__PURE__ */ new Map();
      var figmaVars = /* @__PURE__ */ new Map();
      var collectionModeId = "";
      var stats = { frames: 0, texts: 0, rects: 0, components: 0, instances: 0, variables: 0, vectors: 0 };
      function sendProgress(percent, text) {
        figma.ui.postMessage({ type: "progress", percent, text });
      }
      function sendLog(text, level = "") {
        figma.ui.postMessage({ type: "log", text, level });
      }
      function parseHex(hex) {
        hex = hex.replace("#", "");
        if (hex.length === 3) {
          hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
        return { r, g, b, a };
      }
      function isVar(v) {
        return typeof v === "string" && v.startsWith("$");
      }
      function varName(v) {
        return v.slice(1);
      }
      function resolve(v) {
        if (!isVar(v))
          return v;
        const name = varName(v);
        const val = varValues.get(name);
        if (val === void 0)
          return v;
        return isVar(val) ? resolve(val) : val;
      }
      function resolveNum(v) {
        if (typeof v === "number")
          return v;
        const r = resolve(v);
        return typeof r === "number" ? r : null;
      }
      function mapWeight(w) {
        if (!w)
          return "Regular";
        const m = {
          thin: "Thin",
          "100": "Thin",
          extralight: "ExtraLight",
          "200": "ExtraLight",
          light: "Light",
          "300": "Light",
          normal: "Regular",
          regular: "Regular",
          "400": "Regular",
          medium: "Medium",
          "500": "Medium",
          semibold: "SemiBold",
          "600": "SemiBold",
          bold: "Bold",
          "700": "Bold",
          extrabold: "ExtraBold",
          "800": "ExtraBold",
          black: "Black",
          "900": "Black"
        };
        return m[w.toLowerCase().replace(/[-_ ]/g, "")] || "Regular";
      }
      function preloadFonts(nodes) {
        return __async(this, null, function* () {
          const fonts = /* @__PURE__ */ new Set();
          function scan(n) {
            if (n.fontFamily)
              fonts.add(`${n.fontFamily}::${mapWeight(n.fontWeight)}`);
            if (n.children)
              for (const c of n.children)
                scan(c);
            if (n.descendants) {
              for (const d of Object.values(n.descendants)) {
                if (d.fontFamily)
                  fonts.add(`${d.fontFamily}::${mapWeight(d.fontWeight)}`);
              }
            }
          }
          for (const n of nodes)
            scan(n);
          yield figma.loadFontAsync({ family: "Inter", style: "Regular" });
          for (const key of fonts) {
            const [family, style] = key.split("::");
            try {
              yield figma.loadFontAsync({ family, style });
            } catch (_e) {
              try {
                yield figma.loadFontAsync({ family, style: "Regular" });
              } catch (_e2) {
              }
            }
          }
          sendLog(`Preloaded ${fonts.size} font variants`, "ok");
        });
      }
      function parseSizing(v) {
        if (typeof v === "number")
          return { mode: "FIXED", fallback: v };
        if (typeof v === "string") {
          if (v.startsWith("fill_container"))
            return { mode: "FILL" };
          if (v.startsWith("fit_content")) {
            const m = v.match(/fit_content\((\d+)\)/);
            return { mode: "HUG", fallback: m ? +m[1] : void 0 };
          }
          const r = resolve(v);
          if (typeof r === "number")
            return { mode: "FIXED", fallback: r };
        }
        return { mode: "FIXED" };
      }
      function createVariables(vars) {
        return __async(this, null, function* () {
          if (!vars || Object.keys(vars).length === 0)
            return;
          const collection = figma.variables.createVariableCollection("Pen Design Tokens");
          collectionModeId = collection.modes[0].modeId;
          collection.renameMode(collectionModeId, "Default");
          for (const [name, def] of Object.entries(vars)) {
            varValues.set(name, def.value);
            const typeMap = {
              color: "COLOR",
              number: "FLOAT",
              string: "STRING",
              boolean: "BOOLEAN"
            };
            const resolvedType = typeMap[def.type];
            if (!resolvedType)
              continue;
            try {
              const v = figma.variables.createVariable(name, collection, resolvedType);
              figmaVars.set(name, v);
              const raw = def.value;
              if (def.type === "color" && typeof raw === "string" && !isVar(raw)) {
                const { r, g, b, a } = parseHex(raw);
                v.setValueForMode(collectionModeId, { r, g, b, a });
              } else if (def.type === "number" && typeof raw === "number") {
                v.setValueForMode(collectionModeId, raw);
              } else if (def.type === "string" && typeof raw === "string" && !isVar(raw)) {
                v.setValueForMode(collectionModeId, raw);
              } else if (def.type === "boolean" && typeof raw === "boolean") {
                v.setValueForMode(collectionModeId, raw);
              }
              stats.variables++;
            } catch (e) {
              sendLog(`Variable "${name}": ${e.message}`, "warn");
            }
          }
          for (const [name, def] of Object.entries(vars)) {
            if (isVar(def.value)) {
              const target = figmaVars.get(varName(def.value));
              const source = figmaVars.get(name);
              if (target && source) {
                try {
                  source.setValueForMode(collectionModeId, { type: "VARIABLE_ALIAS", id: target.id });
                } catch (_e) {
                  const concrete = resolve(def.value);
                  if (def.type === "color" && typeof concrete === "string") {
                    const { r, g, b, a } = parseHex(concrete);
                    source.setValueForMode(collectionModeId, { r, g, b, a });
                  }
                }
              }
            }
          }
          sendLog(`Created ${stats.variables} variables`, "ok");
        });
      }
      function buildSolidPaint(color, opacity) {
        const { r, g, b, a } = parseHex(color);
        return { type: "SOLID", color: { r, g, b }, opacity: opacity !== void 0 ? opacity : a };
      }
      function buildGradientPaint(f) {
        const colors = f.colors || [];
        if (colors.length === 0)
          return null;
        const stops = colors.map((s) => {
          const c = typeof s.color === "string" ? isVar(s.color) ? resolve(s.color) : s.color : "#000000";
          const { r, g, b, a } = parseHex(typeof c === "string" ? c : "#000000");
          return { position: typeof s.position === "number" ? s.position : 0, color: { r, g, b, a } };
        });
        const typeMap = {
          linear: "GRADIENT_LINEAR",
          radial: "GRADIENT_RADIAL",
          angular: "GRADIENT_ANGULAR"
        };
        const gradType = typeMap[f.gradientType || "linear"] || "GRADIENT_LINEAR";
        const rot = (typeof f.rotation === "number" ? f.rotation : 180) * Math.PI / 180;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const gradientTransform = [
          [cos, sin, 0.5 - (cos + sin) * 0.5],
          [-sin, cos, 0.5 - (-sin + cos) * 0.5]
        ];
        return {
          type: gradType,
          gradientStops: stops,
          gradientTransform,
          visible: f.enabled !== false
        };
      }
      function buildPaint(fill) {
        if (typeof fill === "string") {
          const c = isVar(fill) ? resolve(fill) : fill;
          if (typeof c === "string")
            return buildSolidPaint(c);
          return null;
        }
        if (typeof fill !== "object" || fill === null)
          return null;
        if (fill.type === "gradient")
          return buildGradientPaint(fill);
        if (fill.type === "image") {
          return { type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.5 }, opacity: 0.15 };
        }
        if (fill.type === "mesh_gradient") {
          const firstColor = fill.colors && fill.colors[0];
          if (firstColor) {
            const c = isVar(firstColor) ? resolve(firstColor) : firstColor;
            if (typeof c === "string")
              return buildSolidPaint(c, 0.5);
          }
          return null;
        }
        const colorVal = fill.color || fill;
        if (typeof colorVal === "string") {
          const c = isVar(colorVal) ? resolve(colorVal) : colorVal;
          if (typeof c === "string") {
            const paint = buildSolidPaint(c, fill.opacity);
            return __spreadProps(__spreadValues({}, paint), { visible: fill.enabled !== false });
          }
        }
        return null;
      }
      function buildPaints(fills) {
        if (fills === void 0 || fills === null)
          return [];
        const arr = Array.isArray(fills) ? fills : [fills];
        const paints = [];
        for (const f of arr) {
          const p = buildPaint(f);
          if (p)
            paints.push(p);
        }
        return paints;
      }
      function applyFills(node, fills, bindVar = true) {
        if (bindVar && isVar(fills)) {
          const fv = figmaVars.get(varName(fills));
          if (fv) {
            try {
              const solid = { type: "SOLID", color: { r: 0, g: 0, b: 0 } };
              const bound = figma.variables.setBoundVariableForPaint(solid, "color", fv);
              node.fills = [bound];
              return;
            } catch (_e) {
            }
          }
        }
        const paints = buildPaints(fills);
        if (paints.length > 0)
          node.fills = paints;
      }
      function applyStroke(node, stroke) {
        if (!stroke)
          return;
        if (stroke.fill) {
          const paints = buildPaints(stroke.fill);
          if (paints.length > 0)
            node.strokes = paints;
        }
        if (stroke.thickness !== void 0) {
          if (typeof stroke.thickness === "number") {
            node.strokeWeight = stroke.thickness;
          } else if (typeof stroke.thickness === "object") {
            node.strokeTopWeight = stroke.thickness.top || 0;
            node.strokeRightWeight = stroke.thickness.right || 0;
            node.strokeBottomWeight = stroke.thickness.bottom || 0;
            node.strokeLeftWeight = stroke.thickness.left || 0;
          } else {
            const n = resolveNum(stroke.thickness);
            if (n !== null)
              node.strokeWeight = n;
          }
        }
        const alignMap = { inside: "INSIDE", center: "CENTER", outside: "OUTSIDE" };
        if (stroke.align && alignMap[stroke.align])
          node.strokeAlign = alignMap[stroke.align];
        if (stroke.dashPattern)
          node.dashPattern = stroke.dashPattern;
        const joinMap = { miter: "MITER", bevel: "BEVEL", round: "ROUND" };
        if (stroke.join && joinMap[stroke.join])
          node.strokeJoin = joinMap[stroke.join];
        const capMap = { none: "NONE", round: "ROUND", square: "SQUARE" };
        if (stroke.cap && capMap[stroke.cap])
          node.strokeCap = capMap[stroke.cap];
      }
      function applyEffects(node, effects) {
        var _a, _b;
        if (!effects)
          return;
        const arr = Array.isArray(effects) ? effects : [effects];
        const out = [];
        for (const e of arr) {
          if (e.type === "blur") {
            out.push({ type: "LAYER_BLUR", radius: (_a = resolveNum(e.radius)) != null ? _a : 10, visible: e.enabled !== false });
          } else if (e.type === "background_blur") {
            out.push({ type: "BACKGROUND_BLUR", radius: (_b = resolveNum(e.radius)) != null ? _b : 10, visible: e.enabled !== false });
          } else if (e.type === "shadow") {
            const cStr = e.color ? isVar(e.color) ? resolve(e.color) : e.color : "#00000040";
            const { r, g, b, a } = parseHex(typeof cStr === "string" ? cStr : "#00000040");
            const shadowType = e.shadowType === "inner" ? "INNER_SHADOW" : "DROP_SHADOW";
            const ox = e.offset ? resolveNum(e.offset.x) || 0 : 0;
            const oy = e.offset ? resolveNum(e.offset.y) || 0 : 0;
            out.push({
              type: shadowType,
              color: { r, g, b, a },
              offset: { x: ox, y: oy },
              radius: resolveNum(e.blur) || 4,
              spread: resolveNum(e.spread) || 0,
              visible: e.enabled !== false,
              blendMode: "NORMAL"
            });
          }
        }
        if (out.length)
          node.effects = out;
      }
      function hasLayout(pen) {
        if (pen.type === "frame" || pen.type === "group") {
          if (pen.layout === "none")
            return false;
          if (pen.type === "frame")
            return true;
          if (pen.type === "group" && (pen.layout === "horizontal" || pen.layout === "vertical"))
            return true;
        }
        return false;
      }
      function applyLayout(node, pen) {
        var _a, _b, _c, _d, _e, _f, _g;
        if (!hasLayout(pen))
          return;
        const dir = pen.layout === "vertical" ? "VERTICAL" : "HORIZONTAL";
        node.layoutMode = dir;
        const gap = resolveNum(pen.gap);
        if (gap !== null)
          node.itemSpacing = gap;
        if (pen.padding !== void 0) {
          const p = pen.padding;
          if (typeof p === "number" || isVar(p)) {
            const val = (_a = resolveNum(p)) != null ? _a : 0;
            node.paddingTop = val;
            node.paddingRight = val;
            node.paddingBottom = val;
            node.paddingLeft = val;
          } else if (Array.isArray(p)) {
            if (p.length === 2) {
              const v = (_b = resolveNum(p[0])) != null ? _b : 0, h = (_c = resolveNum(p[1])) != null ? _c : 0;
              node.paddingTop = v;
              node.paddingBottom = v;
              node.paddingLeft = h;
              node.paddingRight = h;
            } else if (p.length === 4) {
              node.paddingTop = (_d = resolveNum(p[0])) != null ? _d : 0;
              node.paddingRight = (_e = resolveNum(p[1])) != null ? _e : 0;
              node.paddingBottom = (_f = resolveNum(p[2])) != null ? _f : 0;
              node.paddingLeft = (_g = resolveNum(p[3])) != null ? _g : 0;
            }
          }
        }
        const justMap = {
          start: "MIN",
          center: "CENTER",
          end: "MAX",
          space_between: "SPACE_BETWEEN"
        };
        if (pen.justifyContent && justMap[pen.justifyContent]) {
          node.primaryAxisAlignItems = justMap[pen.justifyContent];
        }
        const alignMap = {
          start: "MIN",
          center: "CENTER",
          end: "MAX"
        };
        if (pen.alignItems && alignMap[pen.alignItems]) {
          node.counterAxisAlignItems = alignMap[pen.alignItems];
        }
        node.layoutSizingHorizontal = "HUG";
        node.layoutSizingVertical = "HUG";
      }
      function applySizing(node, pen, parentLayout) {
        try {
          if (pen.width !== void 0) {
            const s = parseSizing(pen.width);
            if ("layoutSizingHorizontal" in node) {
              const fn = node;
              if (s.mode === "FILL" && parentLayout)
                fn.layoutSizingHorizontal = "FILL";
              else if (s.mode === "HUG")
                fn.layoutSizingHorizontal = "HUG";
              else if (s.mode === "FIXED" && s.fallback) {
                fn.layoutSizingHorizontal = "FIXED";
                fn.resize(s.fallback, fn.height);
              }
            } else if (s.mode === "FIXED" && s.fallback && "resize" in node) {
              node.resize(s.fallback, node.height);
            }
          }
          if (pen.height !== void 0) {
            const s = parseSizing(pen.height);
            if ("layoutSizingVertical" in node) {
              const fn = node;
              if (s.mode === "FILL" && parentLayout)
                fn.layoutSizingVertical = "FILL";
              else if (s.mode === "HUG")
                fn.layoutSizingVertical = "HUG";
              else if (s.mode === "FIXED" && s.fallback) {
                fn.layoutSizingVertical = "FIXED";
                fn.resize(fn.width, s.fallback);
              }
            } else if (s.mode === "FIXED" && s.fallback && "resize" in node) {
              node.resize(node.width, s.fallback);
            }
          }
          if (node.type === "TEXT") {
            const tn = node;
            if (pen.textGrowth === "fixed-width" || pen.textGrowth === "fixed-width-height") {
              tn.textAutoResize = pen.textGrowth === "fixed-width" ? "HEIGHT" : "NONE";
              if (pen.width !== void 0) {
                const ws = parseSizing(pen.width);
                if (ws.mode === "FILL" && parentLayout) {
                  tn.layoutSizingHorizontal = "FILL";
                } else if (ws.mode === "FIXED" && ws.fallback) {
                  tn.resize(ws.fallback, tn.height);
                }
              }
            } else {
              tn.textAutoResize = "WIDTH_AND_HEIGHT";
            }
          }
        } catch (_e) {
          sendLog(`Sizing error on ${pen.name || pen.id || pen.type}: ${_e.message}`, "warn");
        }
      }
      function applyCommon(node, pen) {
        var _a, _b, _c, _d;
        node.name = pen.name || pen.id || node.name;
        if (pen.id)
          node.setPluginData("penId", pen.id);
        if (pen.opacity !== void 0 && "opacity" in node) {
          const o = resolveNum(pen.opacity);
          if (o !== null)
            node.opacity = o;
        }
        if (pen.rotation !== void 0) {
          const r = resolveNum(pen.rotation);
          if (r !== null)
            node.rotation = -r;
        }
        if (pen.enabled === false)
          node.visible = false;
        if ("cornerRadius" in node && pen.cornerRadius !== void 0) {
          const cr = pen.cornerRadius;
          if (typeof cr === "number") {
            node.cornerRadius = cr;
          } else if (Array.isArray(cr) && cr.length === 4) {
            node.topLeftRadius = (_a = resolveNum(cr[0])) != null ? _a : 0;
            node.topRightRadius = (_b = resolveNum(cr[1])) != null ? _b : 0;
            node.bottomRightRadius = (_c = resolveNum(cr[2])) != null ? _c : 0;
            node.bottomLeftRadius = (_d = resolveNum(cr[3])) != null ? _d : 0;
          }
        }
        if ("clipsContent" in node && pen.clip !== void 0) {
          node.clipsContent = pen.clip === true;
        }
        if (pen.layoutPosition === "absolute" && "layoutPositioning" in node) {
          try {
            node.layoutPositioning = "ABSOLUTE";
          } catch (_e2) {
          }
        }
      }
      function createText(pen) {
        return __async(this, null, function* () {
          var _a;
          const node = figma.createText();
          stats.texts++;
          const family = pen.fontFamily || "Inter";
          const style = mapWeight(pen.fontWeight);
          let loadedFamily = family, loadedStyle = style;
          try {
            yield figma.loadFontAsync({ family, style });
          } catch (_e) {
            try {
              yield figma.loadFontAsync({ family, style: "Regular" });
              loadedStyle = "Regular";
            } catch (_e2) {
              loadedFamily = "Inter";
              loadedStyle = "Regular";
            }
          }
          node.fontName = { family: loadedFamily, style: loadedStyle };
          if (pen.content && typeof pen.content === "string") {
            const text = isVar(pen.content) ? String(resolve(pen.content)) : pen.content;
            node.characters = text;
          }
          if (pen.fontSize)
            node.fontSize = (_a = resolveNum(pen.fontSize)) != null ? _a : 14;
          if (pen.letterSpacing !== void 0) {
            const ls = resolveNum(pen.letterSpacing);
            if (ls !== null) {
              if (Math.abs(ls) < 1) {
                node.letterSpacing = { value: ls * 100, unit: "PERCENT" };
              } else {
                node.letterSpacing = { value: ls, unit: "PIXELS" };
              }
            }
          }
          if (pen.lineHeight !== void 0) {
            const lh = resolveNum(pen.lineHeight);
            if (lh !== null) {
              node.lineHeight = { value: lh * 100, unit: "PERCENT" };
            }
          }
          const hAlignMap = {
            left: "LEFT",
            center: "CENTER",
            right: "RIGHT",
            justify: "JUSTIFIED"
          };
          if (pen.textAlign && hAlignMap[pen.textAlign]) {
            node.textAlignHorizontal = hAlignMap[pen.textAlign];
          }
          const vAlignMap = {
            top: "TOP",
            middle: "CENTER",
            bottom: "BOTTOM"
          };
          if (pen.textAlignVertical && vAlignMap[pen.textAlignVertical]) {
            node.textAlignVertical = vAlignMap[pen.textAlignVertical];
          }
          if (pen.fill !== void 0)
            applyFills(node, pen.fill);
          applyStroke(node, pen.stroke);
          applyEffects(node, pen.effect);
          return node;
        });
      }
      function createFrameBase(pen, asComponent) {
        const node = asComponent ? figma.createComponent() : figma.createFrame();
        node.fills = [];
        applyLayout(node, pen);
        if (pen.fill !== void 0)
          applyFills(node, pen.fill);
        applyStroke(node, pen.stroke);
        applyEffects(node, pen.effect);
        return node;
      }
      function createInstance(pen) {
        return __async(this, null, function* () {
          const refId = pen.ref;
          const comp = componentMap.get(refId);
          if (!comp) {
            sendLog(`Missing component ref: ${refId}`, "warn");
            return null;
          }
          const instance = comp.createInstance();
          stats.instances++;
          const skipKeys = /* @__PURE__ */ new Set(["type", "ref", "id", "name", "descendants", "children", "x", "y", "reusable"]);
          for (const [key, val] of Object.entries(pen)) {
            if (skipKeys.has(key))
              continue;
            applyPropertyOverride(instance, key, val);
          }
          if (pen.descendants) {
            for (const [idPath, overrides] of Object.entries(pen.descendants)) {
              const target = findDescendant(instance, idPath);
              if (!target) {
                sendLog(`Descendant not found: ${idPath} in ${refId}`, "warn");
                continue;
              }
              yield applyDescendantOverrides(target, overrides);
            }
          }
          return instance;
        });
      }
      function findDescendant(root, idPath) {
        const parts = idPath.split("/");
        let current = root;
        for (const part of parts) {
          if (!("findOne" in current))
            return null;
          const found = current.findOne((n) => n.getPluginData("penId") === part);
          if (!found) {
            const byName = current.findOne((n) => n.name === part);
            if (!byName)
              return null;
            current = byName;
            continue;
          }
          current = found;
        }
        return current;
      }
      function applyPropertyOverride(node, key, val) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _i;
        try {
          switch (key) {
            case "padding":
              if (typeof val === "number" || isVar(val)) {
                const v = (_a = resolveNum(val)) != null ? _a : 0;
                const f = node;
                f.paddingTop = v;
                f.paddingRight = v;
                f.paddingBottom = v;
                f.paddingLeft = v;
              } else if (Array.isArray(val)) {
                const f = node;
                if (val.length === 2) {
                  const v = (_b = resolveNum(val[0])) != null ? _b : 0, h = (_c = resolveNum(val[1])) != null ? _c : 0;
                  f.paddingTop = v;
                  f.paddingBottom = v;
                  f.paddingLeft = h;
                  f.paddingRight = h;
                } else if (val.length === 4) {
                  f.paddingTop = (_d = resolveNum(val[0])) != null ? _d : 0;
                  f.paddingRight = (_e = resolveNum(val[1])) != null ? _e : 0;
                  f.paddingBottom = (_f = resolveNum(val[2])) != null ? _f : 0;
                  f.paddingLeft = (_g = resolveNum(val[3])) != null ? _g : 0;
                }
              }
              break;
            case "fill":
              if ("fills" in node)
                applyFills(node, val);
              break;
            case "stroke":
              applyStroke(node, val);
              break;
            case "effect":
              applyEffects(node, val);
              break;
            case "opacity":
              if ("opacity" in node)
                node.opacity = (_h = resolveNum(val)) != null ? _h : 1;
              break;
            case "cornerRadius":
              if ("cornerRadius" in node) {
                if (typeof val === "number")
                  node.cornerRadius = val;
              }
              break;
            case "width":
            case "height":
              break;
            case "gap":
              if ("itemSpacing" in node)
                node.itemSpacing = (_i = resolveNum(val)) != null ? _i : 0;
              break;
            case "clip":
              if ("clipsContent" in node)
                node.clipsContent = val === true;
              break;
            case "layout":
            case "justifyContent":
            case "alignItems":
              break;
          }
        } catch (e) {
          sendLog(`Override ${key}: ${e.message}`, "warn");
        }
      }
      function applyDescendantOverrides(node, overrides) {
        return __async(this, null, function* () {
          var _a;
          if (!overrides || typeof overrides !== "object")
            return;
          if (overrides.type) {
            sendLog(`Full subtree replacement not yet supported (type: ${overrides.type})`, "warn");
            return;
          }
          if (node.type === "TEXT") {
            const tn = node;
            try {
              yield figma.loadFontAsync(tn.fontName);
            } catch (_e) {
              yield figma.loadFontAsync({ family: "Inter", style: "Regular" });
            }
            if (overrides.content !== void 0) {
              const text = isVar(overrides.content) ? String(resolve(overrides.content)) : String(overrides.content);
              tn.characters = text;
            }
            if (overrides.fontSize !== void 0) {
              const fs = resolveNum(overrides.fontSize);
              if (fs !== null)
                tn.fontSize = fs;
            }
            if (overrides.fontWeight !== void 0) {
              const family = tn.fontName.family;
              const style = mapWeight(overrides.fontWeight);
              try {
                yield figma.loadFontAsync({ family, style });
                tn.fontName = { family, style };
              } catch (_e) {
              }
            }
            if (overrides.fill !== void 0)
              applyFills(tn, overrides.fill);
            if (overrides.letterSpacing !== void 0) {
              const ls = resolveNum(overrides.letterSpacing);
              if (ls !== null) {
                tn.letterSpacing = Math.abs(ls) < 1 ? { value: ls * 100, unit: "PERCENT" } : { value: ls, unit: "PIXELS" };
              }
            }
            if (overrides.lineHeight !== void 0) {
              const lh = resolveNum(overrides.lineHeight);
              if (lh !== null)
                tn.lineHeight = { value: lh * 100, unit: "PERCENT" };
            }
            return;
          }
          if (overrides.fill !== void 0 && "fills" in node)
            applyFills(node, overrides.fill);
          if (overrides.stroke !== void 0)
            applyStroke(node, overrides.stroke);
          if (overrides.effect !== void 0)
            applyEffects(node, overrides.effect);
          if (overrides.opacity !== void 0 && "opacity" in node) {
            node.opacity = (_a = resolveNum(overrides.opacity)) != null ? _a : 1;
          }
          if (overrides.width !== void 0 && "resize" in node) {
            const s = parseSizing(overrides.width);
            if (s.mode === "FIXED" && s.fallback)
              node.resize(s.fallback, node.height);
          }
          if (overrides.height !== void 0 && "resize" in node) {
            const s = parseSizing(overrides.height);
            if (s.mode === "FIXED" && s.fallback)
              node.resize(node.width, s.fallback);
          }
          if (overrides.cornerRadius !== void 0 && "cornerRadius" in node) {
            if (typeof overrides.cornerRadius === "number")
              node.cornerRadius = overrides.cornerRadius;
          }
          if (overrides.enabled === false)
            node.visible = false;
        });
      }
      function createRectangle(pen) {
        const node = figma.createRectangle();
        stats.rects++;
        node.fills = [];
        if (pen.fill !== void 0)
          applyFills(node, pen.fill);
        applyStroke(node, pen.stroke);
        applyEffects(node, pen.effect);
        return node;
      }
      function createEllipse(pen) {
        var _a, _b, _c;
        const node = figma.createEllipse();
        stats.rects++;
        node.fills = [];
        if (pen.fill !== void 0)
          applyFills(node, pen.fill);
        applyStroke(node, pen.stroke);
        applyEffects(node, pen.effect);
        if (pen.startAngle !== void 0 || pen.sweepAngle !== void 0) {
          const start = (_a = resolveNum(pen.startAngle)) != null ? _a : 0;
          const sweep = (_b = resolveNum(pen.sweepAngle)) != null ? _b : 360;
          node.arcData = {
            startingAngle: start * Math.PI / 180,
            endingAngle: (start + sweep) * Math.PI / 180,
            innerRadius: (_c = resolveNum(pen.innerRadius)) != null ? _c : 0
          };
        }
        return node;
      }
      function createLine(pen) {
        const node = figma.createLine();
        stats.vectors++;
        applyStroke(node, pen.stroke);
        applyEffects(node, pen.effect);
        return node;
      }
      function createPolygon(pen) {
        const node = figma.createPolygon();
        stats.vectors++;
        node.fills = [];
        if (pen.fill !== void 0)
          applyFills(node, pen.fill);
        applyStroke(node, pen.stroke);
        applyEffects(node, pen.effect);
        if (pen.polygonCount)
          node.pointCount = pen.polygonCount;
        return node;
      }
      function createPath(pen) {
        stats.vectors++;
        if (pen.geometry) {
          const w = typeof pen.width === "number" ? pen.width : 100;
          const h = typeof pen.height === "number" ? pen.height : 100;
          try {
            const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="${pen.geometry}" fill="black"/></svg>`;
            const frame = figma.createNodeFromSvg(svg);
            if (frame.children.length === 1 && frame.children[0].type === "VECTOR") {
              const vec = frame.children[0];
              vec.name = pen.name || pen.id || "Path";
              if (pen.fill !== void 0)
                applyFills(vec, pen.fill);
              applyStroke(vec, pen.stroke);
              return vec;
            }
            frame.name = pen.name || pen.id || "Path";
            return frame;
          } catch (_e) {
            const rect2 = figma.createRectangle();
            rect2.name = `Path (${pen.name || pen.id || "placeholder"})`;
            rect2.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 }, opacity: 0.2 }];
            return rect2;
          }
        }
        const rect = figma.createRectangle();
        rect.name = pen.name || "Empty path";
        rect.fills = [];
        return rect;
      }
      function createIconFont(pen) {
        return __async(this, null, function* () {
          const frame = figma.createFrame();
          frame.fills = [];
          const w = typeof pen.width === "number" ? pen.width : 24;
          const h = typeof pen.height === "number" ? pen.height : 24;
          frame.resize(w, h);
          const iconFamily = pen.iconFontFamily || "Material Symbols Outlined";
          const iconName = pen.iconFontName || "star";
          const textNode = figma.createText();
          try {
            yield figma.loadFontAsync({ family: iconFamily, style: "Regular" });
            textNode.fontName = { family: iconFamily, style: "Regular" };
          } catch (_e) {
            yield figma.loadFontAsync({ family: "Inter", style: "Regular" });
            textNode.fontName = { family: "Inter", style: "Regular" };
          }
          textNode.characters = iconName;
          textNode.fontSize = Math.min(w, h);
          if (pen.fill !== void 0)
            applyFills(textNode, pen.fill);
          frame.appendChild(textNode);
          frame.layoutMode = "HORIZONTAL";
          frame.primaryAxisAlignItems = "CENTER";
          frame.counterAxisAlignItems = "CENTER";
          frame.layoutSizingHorizontal = "FIXED";
          frame.layoutSizingVertical = "FIXED";
          return frame;
        });
      }
      function buildNode(pen, parent, parentLayout) {
        return __async(this, null, function* () {
          if (!pen || !pen.type)
            return null;
          if (pen.type === "ref") {
            const inst = yield createInstance(pen);
            if (!inst)
              return null;
            applyCommon(inst, pen);
            parent.appendChild(inst);
            if (parentLayout) {
              applySizing(inst, pen, parentLayout);
            } else {
              if (pen.x !== void 0)
                inst.x = pen.x;
              if (pen.y !== void 0)
                inst.y = pen.y;
            }
            return inst;
          }
          let node;
          switch (pen.type) {
            case "frame":
            case "group": {
              const isComp = pen.reusable === true;
              const frame = createFrameBase(pen, isComp);
              if (isComp)
                stats.components++;
              else
                stats.frames++;
              applyCommon(frame, pen);
              parent.appendChild(frame);
              if (parentLayout) {
                applySizing(frame, pen, parentLayout);
              } else {
                if (pen.x !== void 0)
                  frame.x = pen.x;
                if (pen.y !== void 0)
                  frame.y = pen.y;
                const w = parseSizing(pen.width);
                const h = parseSizing(pen.height);
                if (w.mode === "FIXED" && w.fallback) {
                  frame.layoutSizingHorizontal = "FIXED";
                  frame.resize(w.fallback, frame.height);
                }
                if (h.mode === "FIXED" && h.fallback) {
                  frame.layoutSizingVertical = "FIXED";
                  frame.resize(frame.width, h.fallback);
                }
              }
              if (isComp && pen.id)
                componentMap.set(pen.id, frame);
              const childLayout = hasLayout(pen);
              if (pen.children && Array.isArray(pen.children)) {
                for (const child of pen.children) {
                  try {
                    yield buildNode(child, frame, childLayout);
                  } catch (_e3) {
                    sendLog(`Error building child ${child.name || child.id || child.type}: ${_e3.message}`, "warn");
                  }
                }
              }
              return frame;
            }
            case "rectangle": {
              node = createRectangle(pen);
              break;
            }
            case "ellipse": {
              node = createEllipse(pen);
              break;
            }
            case "text": {
              node = yield createText(pen);
              break;
            }
            case "line": {
              node = createLine(pen);
              break;
            }
            case "polygon": {
              node = createPolygon(pen);
              break;
            }
            case "path": {
              node = createPath(pen);
              break;
            }
            case "icon_font": {
              node = yield createIconFont(pen);
              break;
            }
            default: {
              sendLog(`Unknown type: ${pen.type}`, "warn");
              return null;
            }
          }
          applyCommon(node, pen);
          parent.appendChild(node);
          if (parentLayout) {
            applySizing(node, pen, parentLayout);
          } else {
            if (pen.x !== void 0 && "x" in node)
              node.x = pen.x;
            if (pen.y !== void 0 && "y" in node)
              node.y = pen.y;
            const w = typeof pen.width === "number" ? pen.width : null;
            const h = typeof pen.height === "number" ? pen.height : null;
            if (w !== null && h !== null && "resize" in node)
              node.resize(w, h);
            else if (w !== null && "resize" in node)
              node.resize(w, node.height || 100);
            else if (h !== null && "resize" in node)
              node.resize(node.width || 100, h);
          }
          return node;
        });
      }
      function importDocument(data) {
        return __async(this, null, function* () {
          componentMap.clear();
          varValues.clear();
          figmaVars.clear();
          stats = { frames: 0, texts: 0, rects: 0, components: 0, instances: 0, variables: 0, vectors: 0 };
          const doc = Array.isArray(data) ? { children: data } : data;
          const children = doc.children || [];
          if (children.length === 0) {
            figma.ui.postMessage({ type: "error", text: "No nodes found in document" });
            return;
          }
          sendProgress(5, "Creating variables...");
          if (doc.variables) {
            yield createVariables(doc.variables);
          }
          sendProgress(15, "Preloading fonts...");
          yield preloadFonts(children);
          sendProgress(25, "Creating components...");
          const components = children.filter((n) => n.reusable === true);
          const nonComponents = children.filter((n) => n.reusable !== true);
          let compX = 4e3;
          for (let i = 0; i < components.length; i++) {
            const pen = components[i];
            const orig = __spreadProps(__spreadValues({}, pen), { x: compX, y: i * 200 });
            try {
              yield buildNode(orig, figma.currentPage, false);
            } catch (_e4) {
              sendLog(`Component error: ${pen.name || pen.id}: ${_e4.message}`, "warn");
            }
            sendProgress(25 + i / components.length * 25, `Component ${i + 1}/${components.length}: ${pen.name || pen.id}`);
          }
          sendLog(`Created ${components.length} components`, "ok");
          sendProgress(50, "Building pages...");
          for (let i = 0; i < nonComponents.length; i++) {
            const pen = nonComponents[i];
            try {
              yield buildNode(pen, figma.currentPage, false);
            } catch (_e5) {
              sendLog(`Page error: ${pen.name || pen.id}: ${_e5.message}`, "warn");
            }
            sendProgress(50 + i / nonComponents.length * 45, `Page ${i + 1}/${nonComponents.length}: ${pen.name || pen.id}`);
          }
          sendLog(`Created ${nonComponents.length} page frames`, "ok");
          sendProgress(95, "Finishing up...");
          figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);
          sendProgress(100, "Done!");
          figma.ui.postMessage({
            type: "done",
            stats: {
              "Components": stats.components,
              "Instances": stats.instances,
              "Frames": stats.frames,
              "Text layers": stats.texts,
              "Shapes": stats.rects,
              "Vectors": stats.vectors,
              "Variables": stats.variables
            }
          });
        });
      }
      figma.showUI(__html__, { width: 460, height: 520, themeColors: true });
      figma.ui.onmessage = (msg) => __async(exports, null, function* () {
        if (msg.type === "import") {
          try {
            yield importDocument(msg.data);
          } catch (e) {
            figma.ui.postMessage({ type: "error", text: e.message || String(e) });
            console.error(e);
          }
        }
      });
    }
  });
  require_main();
})();
