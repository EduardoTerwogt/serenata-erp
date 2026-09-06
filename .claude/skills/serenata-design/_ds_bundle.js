/* @ds-bundle: {"format":4,"namespace":"SerenataDesignSystem_993393","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"Wordmark","sourcePath":"components/core/Wordmark.jsx"},{"name":"DataTable","sourcePath":"components/data/DataTable.jsx"},{"name":"StatusBadge","sourcePath":"components/data/StatusBadge.jsx"},{"name":"TableFooter","sourcePath":"components/data/TableFooter.jsx"},{"name":"FilterButton","sourcePath":"components/forms/FilterButton.jsx"},{"name":"SearchInput","sourcePath":"components/forms/SearchInput.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"TextField","sourcePath":"components/forms/TextField.jsx"},{"name":"AppShell","sourcePath":"components/layout/AppShell.jsx"},{"name":"SectionHero","sourcePath":"components/layout/SectionHero.jsx"},{"name":"FilterTabs","sourcePath":"components/navigation/FilterTabs.jsx"},{"name":"NavItem","sourcePath":"components/navigation/NavItem.jsx"},{"name":"Sidebar","sourcePath":"components/navigation/Sidebar.jsx"},{"name":"Topbar","sourcePath":"components/navigation/Topbar.jsx"},{"name":"UserMenu","sourcePath":"components/navigation/UserMenu.jsx"},{"name":"SERIES_DEFAULT","sourcePath":"components/patterns/BarChart.jsx"},{"name":"BarChart","sourcePath":"components/patterns/BarChart.jsx"},{"name":"ChartLegend","sourcePath":"components/patterns/BarChart.jsx"},{"name":"Field","sourcePath":"components/patterns/Field.jsx"},{"name":"Folio","sourcePath":"components/patterns/Folio.jsx"},{"name":"Metric","sourcePath":"components/patterns/Metric.jsx"},{"name":"Modal","sourcePath":"components/patterns/Modal.jsx"},{"name":"Panel","sourcePath":"components/patterns/Panel.jsx"},{"name":"ProgressBar","sourcePath":"components/patterns/ProgressBar.jsx"},{"name":"STATE_MAP","sourcePath":"components/patterns/StateBadge.jsx"},{"name":"StateBadge","sourcePath":"components/patterns/StateBadge.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"9a28522c17cb","components/core/Button.jsx":"c1a25070fa38","components/core/Card.jsx":"4a6e2e0b8945","components/core/Icon.jsx":"eeb43b318732","components/core/Wordmark.jsx":"9a74efcd41a0","components/data/DataTable.jsx":"20d081e42ee4","components/data/StatusBadge.jsx":"7d8387d20865","components/data/TableFooter.jsx":"1a4e0544c20a","components/forms/FilterButton.jsx":"3156d9a3def5","components/forms/SearchInput.jsx":"fa062db51980","components/forms/Select.jsx":"01c80cd22191","components/forms/TextField.jsx":"8e1fdcd361e9","components/layout/AppShell.jsx":"e6c7e35bbc14","components/layout/SectionHero.jsx":"2b8b62412317","components/navigation/FilterTabs.jsx":"7cf763a94413","components/navigation/NavItem.jsx":"29f60e8e809b","components/navigation/Sidebar.jsx":"94d81713cc5b","components/navigation/Topbar.jsx":"c90f0dd6d082","components/navigation/UserMenu.jsx":"fadf5bc25417","components/patterns/BarChart.jsx":"ad920857eb57","components/patterns/Field.jsx":"ef34b44d4882","components/patterns/Folio.jsx":"57cec0ed4834","components/patterns/Metric.jsx":"e472e70e3675","components/patterns/Modal.jsx":"e78e5c4a4a54","components/patterns/Panel.jsx":"34b8a107624c","components/patterns/ProgressBar.jsx":"eaf2596f6e21","components/patterns/StateBadge.jsx":"59c1f7df8ced","ui_kits/serenata-app/AdminScreen.jsx":"7caa64a81f47","ui_kits/serenata-app/App.jsx":"feced285e1c4","ui_kits/serenata-app/CotizacionDetalleScreen.jsx":"6d295c1d7038","ui_kits/serenata-app/CotizacionesScreen.jsx":"d0893ffb9b2c","ui_kits/serenata-app/CuentasScreen.jsx":"ec5bf3ef4c60","ui_kits/serenata-app/DashboardScreen.jsx":"76fa7b2e4253","ui_kits/serenata-app/LoginScreen.jsx":"ece5d3e7fc80","ui_kits/serenata-app/PlaneacionScreen.jsx":"ed071e996424","ui_kits/serenata-app/PlantillasScreen.jsx":"c2c95652c0ef","ui_kits/serenata-app/PortalScreen.jsx":"74ca433e1c49","ui_kits/serenata-app/ProyectosScreen.jsx":"b5a121f85c22","ui_kits/serenata-app/ResponsablesScreen.jsx":"8117ba631e99","ui_kits/serenata-app/data.js":"a9bf330d2f2c","ui_kits/serenata-app/parts.jsx":"fff100ce727f"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.SerenataDesignSystem_993393 = window.SerenataDesignSystem_993393 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Avatar({
  initials = 'S',
  size = 32,
  tone = 'accent',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      width: size,
      height: size,
      flex: 'none',
      borderRadius: 'var(--radius-circle)',
      background: tone === 'accent' ? 'var(--accent)' : 'var(--surface-row-alt)',
      color: tone === 'accent' ? 'var(--sn-orange-ink)' : 'var(--text-body)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-ui)',
      fontWeight: 'var(--weight-bold)',
      fontSize: Math.round(size * 0.38),
      letterSpacing: '0.02em',
      ...style
    }
  }, rest), String(initials).slice(0, 2).toUpperCase());
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  children,
  padding = 'var(--space-lg)',
  radius = 'var(--radius-lg)',
  tone = 'surface',
  style,
  ...rest
}) {
  const backgrounds = {
    surface: 'var(--surface-card)',
    row: 'var(--surface-row)',
    app: 'var(--bg-app)'
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: backgrounds[tone] || backgrounds.surface,
      border: '1px solid var(--border-subtle)',
      borderRadius: radius,
      padding,
      boxShadow: 'var(--shadow-card)',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Thin wrapper over the Lucide icon set, loaded from CDN as the UMD global
   `window.lucide` (see readme.md > Iconography). No original icon assets were
   supplied with the brief; Lucide is the flagged substitution — 2px stroke,
   round caps, 24px grid, which matches the outline chevrons/magnifier in the
   source mock. */

const pascal = n => String(n).split(/[-_ ]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
function iconNode(name) {
  const L = typeof window !== 'undefined' ? window.lucide : null;
  if (!L) return null;
  const set = L.icons || L;
  const node = set[pascal(name)] || set[name];
  return Array.isArray(node) ? node : null;
}
function reactAttrs(attrs) {
  const out = {};
  for (const k in attrs) {
    const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = attrs[k];
  }
  return out;
}
function Icon({
  name,
  size = 18,
  strokeWidth = 2,
  color = 'currentColor',
  style,
  ...rest
}) {
  const [, bump] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    if (iconNode(name)) return undefined;
    let tries = 0;
    const id = setInterval(() => {
      if (iconNode(name) || ++tries > 60) {
        clearInterval(id);
        bump();
      }
    }, 50);
    return () => clearInterval(id);
  }, [name]);
  const node = iconNode(name) || [];
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
    style: {
      display: 'block',
      flex: 'none',
      ...style
    }
  }, rest), node.map((child, i) => React.createElement(child[0], {
    key: i,
    ...reactAttrs(child[1] || {})
  })));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  md: {
    height: 'var(--control-height)',
    padding: '0 16px',
    font: 'var(--text-base)',
    radius: 'var(--radius-md)'
  },
  lg: {
    height: 'var(--control-height-lg)',
    padding: '0 26px',
    font: 'var(--text-md)',
    radius: 'var(--radius-input)'
  }
};
function Button({
  children,
  variant = 'primary',
  size = 'lg',
  iconLeft,
  iconRight,
  disabled = false,
  fullWidth = false,
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [down, setDown] = React.useState(false);
  const s = SIZES[size] || SIZES.lg;
  const skins = {
    primary: {
      background: down || hover ? 'var(--accent-pressed)' : 'var(--accent)',
      color: 'var(--sn-orange-ink)',
      border: '1px solid transparent',
      fontWeight: 'var(--weight-bold)'
    },
    secondary: {
      background: hover ? 'var(--surface-row-alt)' : 'var(--surface-input)',
      color: 'var(--text-body)',
      border: '1px solid var(--border-subtle)',
      fontWeight: 'var(--weight-medium)'
    },
    ghost: {
      background: hover ? 'rgba(255,255,255,.05)' : 'transparent',
      color: hover ? 'var(--text-body)' : 'var(--text-muted)',
      border: '1px solid transparent',
      fontWeight: 'var(--weight-medium)'
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setDown(false);
    },
    onMouseDown: () => setDown(true),
    onMouseUp: () => setDown(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-sm)',
      height: s.height,
      padding: s.padding,
      borderRadius: s.radius,
      width: fullWidth ? '100%' : undefined,
      fontFamily: 'var(--font-ui)',
      fontSize: s.font,
      letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transition: 'var(--transition-control)',
      ...skins[variant],
      ...style
    }
  }, rest), iconLeft ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconLeft,
    size: 15
  }) : null, children, iconRight ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: 14
  }) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Wordmark.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* PLACEHOLDER LOCKUP — the real Serenata wordmark and isotipo were not supplied
   as files, so both are rendered in plain display type. Swap for the real
   artwork when it lands; see readme.md > Logo & brand assets. */

function Wordmark({
  variant = 'wordmark',
  tone = 'orange',
  size = 30,
  style,
  ...rest
}) {
  const color = tone === 'orange' ? 'var(--accent)' : 'var(--sn-ink)';
  const mark = /*#__PURE__*/React.createElement("div", {
    style: {
      width: size * 1.5,
      height: size * 1.5,
      borderRadius: Math.round(size * 0.36),
      background: 'var(--accent)',
      color: 'var(--sn-orange-ink)',
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontStretch: 'var(--display-stretch)',
      fontWeight: 900,
      fontSize: size,
      letterSpacing: '-0.02em'
    }
  }, "S");
  const word = /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontStretch: 'var(--display-stretch)',
      fontWeight: 900,
      fontSize: size,
      letterSpacing: '-0.02em',
      textTransform: 'uppercase',
      color,
      lineHeight: 1
    }
  }, "Serenata");
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm)',
      ...style
    }
  }, rest), variant === 'wordmark' ? null : mark, variant === 'mark' ? null : word);
}
Object.assign(__ds_scope, { Wordmark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Wordmark.jsx", error: String((e && e.message) || e) }); }

// components/data/DataTable.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function DataTable({
  columns = [],
  rows = [],
  onRowClick,
  emptyLabel = 'Sin resultados',
  minWidth = 820,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(null);
  const template = columns.map(c => {
    const w = c.width || '1fr';
    return /px|%|em|rem|ch/.test(w) ? w : 'minmax(0, ' + w + ')';
  }).join(' ');
  const padX = 'var(--row-pad-x)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      minWidth
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: template,
      gap: 'var(--space-md)',
      padding: '14px ' + padX,
      borderBottom: '1px solid var(--border-subtle)',
      fontSize: 'var(--text-table-head)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--tracking-label)',
      textTransform: 'uppercase',
      color: 'var(--text-faint)'
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.key,
    style: {
      textAlign: c.align || 'left',
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, c.label))), rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '32px ' + padX,
      textAlign: 'center',
      color: 'var(--text-muted)'
    }
  }, emptyLabel) : rows.map((row, i) => /*#__PURE__*/React.createElement("div", {
    key: row.id || i,
    onClick: () => onRowClick && onRowClick(row),
    onMouseEnter: () => setHover(i),
    onMouseLeave: () => setHover(null),
    style: {
      display: 'grid',
      gridTemplateColumns: template,
      gap: 'var(--space-md)',
      alignItems: 'center',
      padding: 'var(--row-pad-y) ' + padX,
      borderBottom: i === rows.length - 1 ? '1px solid transparent' : '1px solid var(--border-subtle)',
      background: hover === i ? 'var(--surface-row-alt)' : 'transparent',
      cursor: onRowClick ? 'pointer' : 'default',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)',
      transition: 'background-color var(--dur-fast) var(--ease-standard)'
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.key,
    style: {
      textAlign: c.align || 'left',
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontWeight: c.strong ? 'var(--weight-medium)' : 'var(--weight-regular)'
    }
  }, c.render ? c.render(row) : row[c.key]))))));
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataTable.jsx", error: String((e && e.message) || e) }); }

// components/data/StatusBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  aprobada: {
    bg: 'var(--sn-status-approved-bg)',
    fg: 'var(--sn-status-approved-fg)'
  },
  emitida: {
    bg: 'var(--sn-status-issued-bg)',
    fg: 'var(--sn-status-issued-fg)'
  },
  borrador: {
    bg: 'var(--sn-status-draft-bg)',
    fg: 'var(--sn-status-draft-fg)'
  },
  cancelada: {
    bg: 'var(--sn-status-cancelled-bg)',
    fg: 'var(--sn-status-cancelled-fg)'
  }
};
function StatusBadge({
  status = 'borrador',
  children,
  style,
  ...rest
}) {
  const key = String(status).toLowerCase();
  const tone = TONES[key] || TONES.borrador;
  const label = children || String(status).charAt(0).toUpperCase() + String(status).slice(1);
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 80,
      height: 22,
      padding: '0 11px',
      borderRadius: 'var(--radius-pill)',
      background: tone.bg,
      color: tone.fg,
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-sm)',
      fontWeight: 'var(--weight-medium)',
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), label);
}
Object.assign(__ds_scope, { StatusBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatusBadge.jsx", error: String((e && e.message) || e) }); }

// components/forms/FilterButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function FilterButton({
  children = 'Filtrar',
  count,
  size = 'lg',
  onClick,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Button, _extends({
    variant: "secondary",
    size: size,
    iconRight: "chevron-down",
    onClick: onClick,
    style: style
  }, rest), children, count ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 2,
      minWidth: 20,
      height: 20,
      padding: '0 6px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--accent)',
      color: 'var(--sn-orange-ink)',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--weight-bold)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, count) : null);
}
Object.assign(__ds_scope, { FilterButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FilterButton.jsx", error: String((e && e.message) || e) }); }

// components/forms/SearchInput.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SearchInput({
  value,
  defaultValue,
  onChange,
  placeholder = 'Buscar…',
  size = 'md',
  pill = false,
  fullWidth = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const height = size === 'lg' ? 'var(--control-height-lg)' : 'var(--control-height)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      height,
      padding: '0 16px',
      width: fullWidth ? '100%' : undefined,
      background: 'var(--surface-input)',
      border: '1px solid ' + (focus ? 'var(--accent-quiet)' : 'var(--border-subtle)'),
      borderRadius: pill ? 'var(--radius-pill)' : 'var(--radius-input)',
      transition: 'var(--transition-control)',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 15,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("input", _extends({
    type: "text",
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    placeholder: placeholder,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      background: 'transparent',
      border: 0,
      outline: 'none',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-md)',
      color: 'var(--text-body)'
    }
  }, rest)));
}
Object.assign(__ds_scope, { SearchInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SearchInput.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  value,
  defaultValue,
  onChange,
  options = [],
  size = 'sm',
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const height = size === 'md' ? 'var(--control-height)' : '29px';
  return /*#__PURE__*/React.createElement("div", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      height,
      minWidth: 0,
      background: hover ? 'var(--surface-row-alt)' : 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      transition: 'var(--transition-control)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    style: {
      appearance: 'none',
      background: 'transparent',
      border: 0,
      outline: 'none',
      padding: '0 32px 0 13px',
      height: '100%',
      cursor: 'pointer',
      width: '100%',
      minWidth: 0,
      textOverflow: 'ellipsis',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }, rest), options.map(o => {
    const opt = typeof o === 'object' ? o : {
      value: o,
      label: String(o)
    };
    return /*#__PURE__*/React.createElement("option", {
      key: opt.value,
      value: opt.value,
      style: {
        background: 'var(--surface-card)'
      }
    }, opt.label);
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 10,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 14,
    color: "var(--text-muted)"
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/data/TableFooter.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TableFooter({
  shown,
  total,
  unit = '',
  perPage = 10,
  perPageOptions = [10, 25, 50],
  onPerPageChange,
  label = 'Mostrando',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-md)',
      padding: '16px var(--row-pad-x)',
      borderTop: '1px solid var(--border-subtle)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-muted)'
    }
  }, label, " ", shown, " de ", total, unit ? ' ' + unit : ''), /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-muted)'
    }
  }, "Resultados por p\xE1gina", /*#__PURE__*/React.createElement(__ds_scope.Select, {
    size: "md",
    options: perPageOptions,
    value: perPage,
    onChange: e => onPerPageChange && onPerPageChange(Number(e.target.value))
  })));
}
Object.assign(__ds_scope, { TableFooter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/TableFooter.jsx", error: String((e && e.message) || e) }); }

// components/forms/TextField.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TextField({
  label,
  hint,
  value,
  defaultValue,
  onChange,
  placeholder,
  disabled,
  fullWidth = true,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)',
      width: fullWidth ? '100%' : undefined,
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    className: "sn-label"
  }, label) : null, /*#__PURE__*/React.createElement("input", _extends({
    type: "text",
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    placeholder: placeholder,
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      height: 'var(--control-height)',
      padding: '0 14px',
      background: 'var(--surface-input)',
      border: '1px solid ' + (focus ? 'var(--accent-quiet)' : 'var(--border-subtle)'),
      borderRadius: 'var(--radius-sm)',
      outline: 'none',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)',
      opacity: disabled ? 0.5 : 1,
      transition: 'var(--transition-control)'
    }
  }, rest)), hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)'
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { TextField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/TextField.jsx", error: String((e && e.message) || e) }); }

// components/layout/AppShell.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function AppShell({
  sidebar,
  topbar,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-app)',
      ...style
    }
  }, rest), sidebar, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column'
    }
  }, topbar, /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      minWidth: 0,
      padding: 'var(--space-sm) var(--content-pad) var(--space-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, children)));
}
Object.assign(__ds_scope, { AppShell });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/AppShell.jsx", error: String((e && e.message) || e) }); }

// components/layout/SectionHero.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SectionHero({
  eyebrow,
  title,
  subtitle,
  action,
  minHeight = 106,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("section", _extends({
    style: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 'var(--radius-xl)',
      background: 'var(--sn-texture)',
      backgroundSize: 'cover',
      minHeight,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--sn-texture-scrim)',
      backdropFilter: 'blur(48px)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-xl)',
      padding: 'var(--space-lg) var(--space-xl)',
      flexWrap: 'wrap',
      minHeight
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("div", {
    className: "sn-eyebrow",
    style: {
      marginBottom: 8
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("h1", {
    className: "sn-display",
    style: {
      margin: 0,
      fontSize: 'clamp(28px, 3.5vw, var(--text-h1))',
      overflowWrap: 'anywhere'
    }
  }, title), subtitle ? /*#__PURE__*/React.createElement("p", {
    className: "sn-lead",
    style: {
      margin: '10px 0 0',
      maxWidth: 520
    }
  }, subtitle) : null), action ? /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 'none'
    }
  }, action) : null));
}
Object.assign(__ds_scope, { SectionHero });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/SectionHero.jsx", error: String((e && e.message) || e) }); }

// components/navigation/FilterTabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function FilterTabs({
  tabs = [],
  value,
  onChange,
  contained = true,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(null);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-xs)',
      padding: contained ? 5 : 0,
      background: contained ? 'var(--surface-card)' : 'transparent',
      border: contained ? '1px solid var(--border-subtle)' : 0,
      borderRadius: contained ? 'var(--radius-input)' : 0,
      ...style
    }
  }, rest), tabs.map(t => {
    const tab = typeof t === 'object' ? t : {
      id: t,
      label: String(t)
    };
    const active = tab.id === value;
    return /*#__PURE__*/React.createElement("button", {
      key: tab.id,
      type: "button",
      onClick: () => onChange && onChange(tab.id),
      onMouseEnter: () => setHover(tab.id),
      onMouseLeave: () => setHover(null),
      style: {
        height: 32,
        padding: '0 21px',
        border: 0,
        cursor: 'pointer',
        borderRadius: 'var(--radius-sm)',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--sn-orange-ink)' : hover === tab.id ? 'var(--text-body)' : 'var(--text-muted)',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-md)',
        fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
        transition: 'var(--transition-control)'
      }
    }, tab.label, tab.count != null ? /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 8,
        opacity: 0.75,
        fontWeight: 'var(--weight-medium)'
      }
    }, tab.count) : null);
  }));
}
Object.assign(__ds_scope, { FilterTabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/FilterTabs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/NavItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function NavItem({
  icon,
  label,
  active = false,
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      width: '100%',
      height: 'var(--nav-item-height)',
      padding: '0 14px',
      border: 0,
      cursor: 'pointer',
      borderRadius: 'var(--radius-md)',
      textAlign: 'left',
      background: active ? 'var(--accent)' : hover ? 'rgba(255,255,255,.05)' : 'transparent',
      color: active ? 'var(--sn-orange-ink)' : hover ? 'var(--text-body)' : 'var(--text-muted)',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-nav)',
      fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
      transition: 'var(--transition-control)',
      ...style
    }
  }, rest), icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 15
  }) : null, /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { NavItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/NavItem.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Sidebar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Sidebar({
  items = [],
  activeId,
  onSelect,
  footer = null,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("aside", _extends({
    style: {
      position: 'relative',
      width: 'var(--sidebar-width)',
      flex: 'none',
      minHeight: '100%',
      background: 'var(--sn-texture-rail)',
      overflow: 'hidden',
      borderRight: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-rail)',
      display: 'flex',
      flexDirection: 'column',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      backdropFilter: 'blur(80px)',
      background: 'rgba(12,15,20,.42)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      padding: 'var(--space-lg) var(--sidebar-pad)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'var(--topbar-height)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      marginBottom: 'var(--space-sm)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Wordmark, {
    variant: "mark",
    size: 21
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--nav-gap)'
    }
  }, items.map(it => /*#__PURE__*/React.createElement(__ds_scope.NavItem, {
    key: it.id,
    icon: it.icon,
    label: it.label,
    active: it.id === activeId,
    onClick: () => onSelect && onSelect(it.id)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 20
    }
  }), footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 11px'
    }
  }, footer) : null));
}
Object.assign(__ds_scope, { Sidebar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Sidebar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/UserMenu.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function UserMenu({
  name = 'Usuario',
  nickname = '',
  initials,
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const auto = name.split(' ').map(w => w[0]).join('').slice(0, 2);
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      border: 0,
      cursor: 'pointer',
      padding: '5px 12px 5px 5px',
      borderRadius: 'var(--radius-pill)',
      flex: 'none',
      background: hover ? 'rgba(255,255,255,.05)' : 'transparent',
      transition: 'var(--transition-control)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    initials: initials || auto,
    size: 36
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      textAlign: 'right',
      lineHeight: 1.3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-primary)',
      whiteSpace: 'nowrap'
    }
  }, name), nickname ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-muted)',
      whiteSpace: 'nowrap'
    }
  }, nickname) : null));
}
Object.assign(__ds_scope, { UserMenu });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/UserMenu.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Topbar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Topbar({
  user = {
    name: 'Usuario'
  },
  left,
  right,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("header", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)',
      minHeight: 'var(--topbar-height)',
      padding: 'var(--space-lg) var(--content-pad)',
      background: 'transparent',
      ...style
    }
  }, rest), left, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }), right, /*#__PURE__*/React.createElement(__ds_scope.UserMenu, {
    name: user.name,
    nickname: user.nickname,
    initials: user.initials
  }));
}
Object.assign(__ds_scope, { Topbar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Topbar.jsx", error: String((e && e.message) || e) }); }

// components/patterns/BarChart.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Barras agrupadas, sin librería ni ejes: el lenguaje de gráficas del sistema
   es monocromo con el naranja de marca para la serie principal y el teal de la
   textura (--sn-texture-teal) como única segunda serie. Sin cuadrícula, sin
   eje Y; el detalle vive en el tooltip al hover. */
const SERIES_DEFAULT = [{
  key: 'ingresos',
  label: 'Ingresos',
  color: 'var(--accent)'
}, {
  key: 'egresos',
  label: 'Egresos',
  color: 'var(--sn-texture-teal)'
}];
function BarChart({
  data = [],
  series = SERIES_DEFAULT,
  labelKey = 'mes',
  height = 168,
  onBarClick,
  format = v => v,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(null);
  const max = Math.max(...data.flatMap(d => series.map(s => d[s.key])), 1) * 1.08;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: style
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 'var(--space-md)',
      height,
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, data.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: d[labelKey] || i,
    onClick: () => onBarClick && onBarClick(d),
    onMouseEnter: () => setHover(i),
    onMouseLeave: () => setHover(null),
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 4,
      height: '100%',
      position: 'relative',
      cursor: onBarClick ? 'pointer' : 'default'
    }
  }, hover === i ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -4,
      left: '50%',
      transform: 'translate(-50%,-100%)',
      background: 'var(--surface-row-alt)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      padding: '7px 11px',
      whiteSpace: 'nowrap',
      boxShadow: 'var(--shadow-raised)',
      zIndex: 2
    }
  }, series.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.key,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 'var(--text-md)',
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 2,
      background: s.color,
      flex: 'none'
    }
  }), s.label, " ", format(d[s.key])))) : null, series.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.key,
    style: {
      flex: 1,
      maxWidth: 22,
      height: d[s.key] / max * 100 + '%',
      background: s.color,
      borderRadius: '4px 4px 0 0',
      opacity: hover === null || hover === i ? 1 : 0.45,
      transition: 'opacity var(--dur-fast) var(--ease-standard)'
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-md)',
      marginTop: 9
    }
  }, data.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: d[labelKey] || i,
    style: {
      flex: 1,
      textAlign: 'center',
      fontSize: 'var(--text-xs)',
      color: hover === i ? 'var(--text-body)' : 'var(--text-faint)',
      letterSpacing: 'var(--tracking-label)',
      textTransform: 'uppercase'
    }
  }, d[labelKey]))));
}
function ChartLegend({
  series = SERIES_DEFAULT,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      gap: 'var(--space-lg)',
      flexWrap: 'wrap',
      minWidth: 0,
      ...style
    }
  }, rest), series.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.key,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: 3,
      background: s.color,
      flex: 'none'
    }
  }), s.label)));
}
Object.assign(__ds_scope, { SERIES_DEFAULT, BarChart, ChartLegend });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/BarChart.jsx", error: String((e && e.message) || e) }); }

// components/patterns/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Field({
  label,
  value,
  children,
  span,
  nowrapLabel = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      minWidth: 0,
      gridColumn: span ? 'span ' + span : undefined,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "sn-label",
    style: {
      marginBottom: 7,
      whiteSpace: nowrapLabel ? 'nowrap' : undefined
    }
  }, label), children || /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }, value));
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/Field.jsx", error: String((e && e.message) || e) }); }

// components/patterns/Folio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Un folio (SH014, COT-2451, F-2291) es un dato "tipo código" y debe leerse
   distinto al resto del texto. El sistema no tiene familia monoespaciada, así
   que se resuelve con la display face en tamaño pequeño y tracking abierto. */
function Folio({
  children,
  size = 13,
  color = 'var(--text-body)',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: "sn-display",
    style: {
      fontSize: size,
      letterSpacing: '0.06em',
      color,
      display: 'inline-block',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Folio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/Folio.jsx", error: String((e && e.message) || e) }); }

// components/patterns/Metric.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Metric({
  label,
  value,
  nota,
  accent = false,
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement(__ds_scope.Card, _extends({
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    padding: "var(--space-lg)",
    style: {
      minWidth: 0,
      cursor: onClick ? 'pointer' : 'default',
      background: hover && onClick ? 'var(--surface-row-alt)' : 'var(--surface-card)',
      transition: 'var(--transition-control)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "sn-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "sn-display",
    style: {
      fontSize: 'var(--text-h2)',
      marginTop: 10,
      color: accent ? 'var(--accent)' : 'var(--text-primary)'
    }
  }, value), nota ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, nota) : null);
}
Object.assign(__ds_scope, { Metric });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/Metric.jsx", error: String((e && e.message) || e) }); }

// components/patterns/Modal.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* El sistema no tiene panel lateral: todo detalle y toda confirmación se abren
   como modal centrado sobre un scrim opaco. Es el único lugar del producto que
   usa --shadow-overlay. */
function Modal({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  width = 720,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 40,
      background: 'rgba(8,10,13,.72)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-2xl)'
    }
  }, /*#__PURE__*/React.createElement("div", _extends({
    onClick: e => e.stopPropagation(),
    style: {
      width: '100%',
      maxWidth: width,
      maxHeight: '88vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-overlay)',
      overflow: 'hidden',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-md)',
      padding: 'var(--space-lg)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("div", {
    className: "sn-eyebrow",
    style: {
      marginBottom: 5
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("div", {
    className: "sn-display",
    style: {
      fontSize: 'var(--text-h3)'
    }
  }, title)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    "aria-label": "Cerrar",
    style: {
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      color: 'var(--text-muted)',
      padding: 4
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-lg)',
      overflowY: 'auto'
    }
  }, children), footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: 'var(--space-lg)',
      borderTop: '1px solid var(--border-subtle)'
    }
  }, footer) : null));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/Modal.jsx", error: String((e && e.message) || e) }); }

// components/patterns/Panel.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Panel({
  title,
  eyebrow,
  action,
  children,
  padding = 'var(--space-lg)',
  style,
  bodyStyle,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, _extends({
    padding: "0",
    style: style
  }, rest), title || action ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: '15px var(--space-lg)',
      borderBottom: '1px solid var(--border-subtle)',
      flexWrap: 'wrap',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("div", {
    className: "sn-eyebrow",
    style: {
      marginBottom: 4
    }
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-lg)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-primary)'
    }
  }, title) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      flexWrap: 'wrap'
    }
  }, action)) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      padding,
      ...bodyStyle
    }
  }, children));
}
Object.assign(__ds_scope, { Panel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/Panel.jsx", error: String((e && e.message) || e) }); }

// components/patterns/ProgressBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ProgressBar({
  value = 0,
  height = 5,
  tone = 'var(--accent)',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      height,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-input)',
      overflow: 'hidden',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      width: Math.max(0, Math.min(100, value)) + '%',
      height: '100%',
      background: tone,
      transition: 'width var(--dur-slow) var(--ease-standard)'
    }
  }));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/patterns/StateBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* El sistema tiene cuatro tonos de badge y no se deben agregar más. StateBadge
   mapea los estados de proyecto, de cuentas y de validación de documentos sobre
   esos cuatro. Para agregar un estado nuevo, súmalo aquí en vez de inventar un
   color. */
const STATE_MAP = {
  PREPRODUCCIÓN: {
    tone: 'borrador',
    label: 'Preproducción'
  },
  RODAJE: {
    tone: 'emitida',
    label: 'Rodaje'
  },
  POSTPRODUCCIÓN: {
    tone: 'emitida',
    label: 'Postproducción'
  },
  FINALIZADO: {
    tone: 'aprobada',
    label: 'Finalizado'
  },
  FACTURA_PENDIENTE: {
    tone: 'borrador',
    label: 'Factura pendiente'
  },
  FACTURADO: {
    tone: 'emitida',
    label: 'Facturado'
  },
  PARCIALMENTE_PAGADO: {
    tone: 'emitida',
    label: 'Parcial'
  },
  PAGADO: {
    tone: 'aprobada',
    label: 'Pagado'
  },
  VENCIDO: {
    tone: 'cancelada',
    label: 'Vencido'
  },
  PENDIENTE: {
    tone: 'borrador',
    label: 'Pendiente'
  },
  EN_PROCESO_PAGO: {
    tone: 'emitida',
    label: 'En proceso'
  },
  ACTIVO: {
    tone: 'aprobada',
    label: 'Activo'
  },
  INACTIVO: {
    tone: 'borrador',
    label: 'Inactivo'
  },
  validado: {
    tone: 'aprobada',
    label: 'Validado'
  },
  revision: {
    tone: 'emitida',
    label: 'En revisión'
  },
  pendiente: {
    tone: 'borrador',
    label: 'Pendiente'
  },
  rechazado: {
    tone: 'cancelada',
    label: 'Rechazado'
  }
};
function StateBadge({
  state,
  children,
  style,
  ...rest
}) {
  const s = STATE_MAP[state] || {
    tone: 'borrador',
    label: String(state)
  };
  return /*#__PURE__*/React.createElement(__ds_scope.StatusBadge, _extends({
    status: s.tone,
    style: style
  }, rest), children || s.label);
}
Object.assign(__ds_scope, { STATE_MAP, StateBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/StateBadge.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/AdminScreen.jsx
try { (() => {
/* 9 · Admin · Usuarios y 10 · Admin · Sincronización con Google Sheets.
   Fase 5 no cambia el fondo de ninguna de las dos. */
const {
  Button,
  Card,
  Icon,
  TextField,
  FilterTabs,
  StatusBadge,
  DataTable,
  SectionHero
} = window.SerenataDesignSystem_993393;
function UsuarioModal({
  u,
  onClose,
  nuevo
}) {
  const [nombre, setNombre] = React.useState(u ? u.nombre : '');
  const [correo, setCorreo] = React.useState(u ? u.correo : '');
  const [pass, setPass] = React.useState('');
  const [secciones, setSecciones] = React.useState(u ? u.secciones : ['Dashboard']);
  const [errores, setErrores] = React.useState({});
  const toggle = s => setSecciones(secciones.includes(s) ? secciones.filter(x => x !== s) : [...secciones, s]);
  const guardar = () => {
    const e = {};
    if (!nombre.trim()) e.nombre = 'El nombre es obligatorio.';
    if (!/.+@.+\..+/.test(correo)) e.correo = 'Escribe un correo válido.';
    if (nuevo && pass.length < 8) e.pass = 'Mínimo 8 caracteres.';
    if (!secciones.length) e.secciones = 'Asigna al menos una sección.';
    setErrores(e);
    if (!Object.keys(e).length) onClose();
  };
  return /*#__PURE__*/React.createElement(window.Modal, {
    title: nuevo ? 'Nuevo usuario' : u.nombre,
    eyebrow: "Admin \xB7 Usuarios",
    width: 620,
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "lg",
      onClick: onClose
    }, "Cancelar"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      onClick: guardar
    }, nuevo ? 'Crear usuario' : 'Guardar cambios'))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    label: "Nombre",
    value: nombre,
    onChange: e => setNombre(e.target.value),
    placeholder: "Nombre y apellido",
    hint: errores.nombre
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "Correo",
    value: correo,
    onChange: e => setCorreo(e.target.value),
    placeholder: "nombre@serenata.mx",
    hint: errores.correo
  }), /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sn-label"
  }, "Contrase\xF1a"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    value: pass,
    onChange: e => setPass(e.target.value),
    placeholder: nuevo ? 'Mínimo 8 caracteres' : 'Dejar vacío para no cambiar',
    style: {
      height: 'var(--control-height)',
      padding: '0 14px',
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      outline: 'none',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }), errores.pass ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--sn-status-cancelled-fg)'
    }
  }, errores.pass) : null), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sn-label",
    style: {
      marginBottom: 11
    }
  }, "Secciones habilitadas"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))',
      gap: 11
    }
  }, window.SN5.secciones.map(s => /*#__PURE__*/React.createElement(window.Checkbox, {
    key: s,
    checked: secciones.includes(s),
    onChange: () => toggle(s),
    label: s
  }))), errores.secciones ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 9,
      fontSize: 'var(--text-sm)',
      color: 'var(--sn-status-cancelled-fg)'
    }
  }, errores.secciones) : null)));
}
function Usuarios() {
  const [usuarios, setUsuarios] = React.useState(window.SN5.usuarios);
  const [editar, setEditar] = React.useState(null);
  const [nuevo, setNuevo] = React.useState(false);
  const toggleActivo = u => setUsuarios(usuarios.map(x => x === u ? {
    ...x,
    activo: !x.activo
  } : x));
  const columns = [{
    key: 'nombre',
    label: 'Nombre',
    width: '1.2fr',
    render: u => /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 'var(--weight-medium)',
        color: 'var(--text-primary)'
      }
    }, u.nombre, u.yo ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-faint)',
        fontWeight: 'var(--weight-regular)'
      }
    }, " (t\xFA)") : null)
  }, {
    key: 'correo',
    label: 'Correo',
    width: '1.3fr'
  }, {
    key: 'secciones',
    label: 'Secciones asignadas',
    width: '2.2fr',
    render: u => /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        padding: '4px 0'
      }
    }, u.secciones.map(s => /*#__PURE__*/React.createElement("span", {
      key: s,
      style: {
        padding: '3px 9px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-row-alt)',
        border: '1px solid var(--border-subtle)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap'
      }
    }, s)))
  }, {
    key: 'activo',
    label: 'Estado',
    width: '110px',
    render: u => /*#__PURE__*/React.createElement(StatusBadge, {
      status: u.activo ? 'aprobada' : 'borrador'
    }, u.activo ? 'Activo' : 'Inactivo')
  }, {
    key: 'acciones',
    label: 'Acciones',
    width: '210px',
    align: 'right',
    render: u => /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 'var(--space-sm)',
        justifyContent: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "md",
      onClick: () => setEditar(u)
    }, "Editar"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "md",
      disabled: u.yo,
      onClick: () => toggleActivo(u)
    }, u.activo ? 'Desactivar' : 'Activar'))
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(window.Panel, {
    title: "Usuarios",
    padding: "0",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "md",
      iconLeft: "plus",
      onClick: () => setNuevo(true)
    }, "Nuevo usuario")
  }, /*#__PURE__*/React.createElement(DataTable, {
    columns: columns,
    rows: usuarios,
    minWidth: 980
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)'
    }
  }, "No puedes desactivar tu propio usuario. No hay registro p\xFAblico: las cuentas se crean aqu\xED."), editar ? /*#__PURE__*/React.createElement(UsuarioModal, {
    u: editar,
    onClose: () => setEditar(null)
  }) : null, nuevo ? /*#__PURE__*/React.createElement(UsuarioModal, {
    nuevo: true,
    onClose: () => setNuevo(false)
  }) : null);
}
const SN5_PASOS_SHEETS = ['Reautoriza la cuenta de Google con permisos de Drive y Sheets.', 'Actualiza las variables de entorno del servidor con el token nuevo.', 'Crea el Sheet con el botón "Crear Sheet" de abajo.', 'Copia el spreadsheetId que aparece y pégalo en la configuración.'];
function Sincronizacion() {
  const s = window.SN5.sheets;
  const [corriendo, setCorriendo] = React.useState(null);
  const [resultado, setResultado] = React.useState(null);
  const [error, setError] = React.useState('');
  const correr = accion => {
    setError('');
    setResultado(null);
    setCorriendo(accion);
    setTimeout(() => {
      setCorriendo(null);
      if (accion === 'crear') {
        setError('No se pudo crear el Sheet: el token de Google expiró. Reautoriza la cuenta y vuelve a intentar.');
        return;
      }
      setResultado({
        accion,
        pestanas: s.pestanas
      });
    }, 1100);
  };
  const totales = resultado ? resultado.pestanas.reduce((a, p) => ({
    insertadas: a.insertadas + p.insertadas,
    actualizadas: a.actualizadas + p.actualizadas,
    borradas: a.borradas + p.borradas,
    errores: a.errores + p.errores
  }), {
    insertadas: 0,
    actualizadas: 0,
    borradas: 0,
    errores: 0
  }) : null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))',
      gap: 'var(--space-lg)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "Configuraci\xF3n inicial"
  }, /*#__PURE__*/React.createElement("ol", {
    style: {
      margin: 0,
      paddingLeft: 22,
      display: 'flex',
      flexDirection: 'column',
      gap: 13
    }
  }, SN5_PASOS_SHEETS.map((p, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-muted)',
      lineHeight: 'var(--lh-body)'
    }
  }, p))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-lg)',
      paddingTop: 'var(--space-lg)',
      borderTop: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sn-label",
    style: {
      marginBottom: 7
    }
  }, "spreadsheetId actual"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: '10px 13px',
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-md)',
      color: 'var(--text-body)',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, s.spreadsheetId), /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Copiar",
    style: {
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      color: 'var(--text-muted)',
      padding: 2,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "copy",
    size: 15
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "Acciones"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)'
    }
  }, [{
    id: 'crear',
    label: 'Crear Sheet',
    nota: 'Inicializa el spreadsheet con una pestaña por tabla.',
    icon: 'plus'
  }, {
    id: 'export',
    label: 'Supabase → Sheets',
    nota: 'Exporta la base de datos al Sheet.',
    icon: 'upload'
  }, {
    id: 'import',
    label: 'Sheets → Supabase',
    nota: 'Importa al sistema los cambios hechos en el Sheet.',
    icon: 'download'
  }].map(a => /*#__PURE__*/React.createElement("div", {
    key: a.id,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: 'var(--space-md) var(--space-lg)',
      background: 'var(--surface-row)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 160,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-primary)',
      fontWeight: 'var(--weight-medium)'
    }
  }, a.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-faint)',
      marginTop: 2
    }
  }, a.nota)), /*#__PURE__*/React.createElement(Button, {
    variant: a.id === 'crear' ? 'secondary' : 'primary',
    size: "md",
    iconLeft: corriendo === a.id ? 'loader' : a.icon,
    disabled: !!corriendo,
    onClick: () => correr(a.id)
  }, corriendo === a.id ? 'Corriendo…' : 'Ejecutar'))))), error ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-md)',
      padding: 'var(--space-lg)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--sn-status-cancelled-bg)',
      color: 'var(--sn-status-cancelled-fg)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert-triangle",
    size: 17
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-base)',
      lineHeight: 'var(--lh-body)'
    }
  }, error)) : null, resultado ? /*#__PURE__*/React.createElement(window.Panel, {
    title: "Resultado",
    padding: "0",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "md",
      iconRight: "external-link"
    }, "Abrir el Sheet")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))',
      gap: 'var(--space-lg)',
      padding: 'var(--space-lg)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, [['Insertadas', totales.insertadas, 'var(--sn-status-approved-fg)'], ['Actualizadas', totales.actualizadas, 'var(--text-primary)'], ['Borradas', totales.borradas, 'var(--text-muted)'], ['Errores', totales.errores, totales.errores ? 'var(--sn-status-cancelled-fg)' : 'var(--text-muted)']].map(([l, v, c]) => /*#__PURE__*/React.createElement("div", {
    key: l
  }, /*#__PURE__*/React.createElement("div", {
    className: "sn-label",
    style: {
      marginBottom: 5
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    className: "sn-display",
    style: {
      fontSize: 'var(--text-h3)',
      color: c
    }
  }, v)))), resultado.pestanas.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.nombre,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: '11px var(--space-lg)',
      borderBottom: i === resultado.pestanas.length - 1 ? 0 : '1px solid var(--border-subtle)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: p.ok ? 'check' : 'x',
    size: 15,
    strokeWidth: 2.5,
    color: p.ok ? 'var(--sn-status-approved-fg)' : 'var(--sn-status-cancelled-fg)'
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 120,
      flex: 1,
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }, p.nombre), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, p.ok ? p.insertadas + ' ins · ' + p.actualizadas + ' act · ' + p.borradas + ' bor' : p.errores + ' errores')))) : null));
}
function AdminScreen() {
  const [tab, setTab] = React.useState('usuarios');
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionHero, {
    title: "Admin"
  }), /*#__PURE__*/React.createElement(FilterTabs, {
    tabs: [{
      id: 'usuarios',
      label: 'Usuarios'
    }, {
      id: 'sync',
      label: 'Google Sheets'
    }],
    value: tab,
    onChange: setTab,
    style: {
      alignSelf: 'flex-start'
    }
  }), tab === 'usuarios' ? /*#__PURE__*/React.createElement(Usuarios, null) : /*#__PURE__*/React.createElement(Sincronizacion, null));
}
Object.assign(window, {
  AdminScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/AdminScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/App.jsx
try { (() => {
/* Shell que une las pantallas del kit Fase 5. Login → app shell con rail fijo,
   topbar y la vista activa. Las secciones que Fase 5 no rediseña se muestran
   con su nota de alcance en lugar de un mock inventado. */
const {
  AppShell,
  Sidebar,
  Topbar,
  SectionHero
} = window.SerenataDesignSystem_993393;
function App({
  initial,
  detalle
}) {
  const [logged, setLogged] = React.useState(true);
  const [view, setView] = React.useState(initial || 'inicio');
  const [cotizacion, setCotizacion] = React.useState(detalle ? window.SN5.cotizaciones[0] : null);
  const go = id => {
    setCotizacion(null);
    setView(id);
  };
  if (!logged) return /*#__PURE__*/React.createElement(window.LoginScreen, {
    onEnter: () => setLogged(true)
  });
  let content;
  if (cotizacion) content = /*#__PURE__*/React.createElement(window.CotizacionDetalleScreen, {
    cotizacion: cotizacion,
    onBack: () => setCotizacion(null),
    onGo: go
  });else if (view === 'inicio') content = /*#__PURE__*/React.createElement(window.DashboardScreen, {
    onGo: go
  });else if (view === 'cotizaciones') content = /*#__PURE__*/React.createElement(window.CotizacionesScreen, {
    onOpen: setCotizacion,
    onNueva: () => setCotizacion({
      folio: 'SH015',
      estatus: 'borrador'
    })
  });else if (view === 'proyectos') content = /*#__PURE__*/React.createElement(window.ProyectosScreen, null);else if (view === 'cuentas') content = /*#__PURE__*/React.createElement(window.CuentasScreen, null);else if (view === 'portal') content = /*#__PURE__*/React.createElement(window.PortalScreen, null);else if (view === 'responsables') content = /*#__PURE__*/React.createElement(window.ResponsablesScreen, null);else if (view === 'planeacion') content = /*#__PURE__*/React.createElement(window.PlaneacionScreen, null);else if (view === 'plantillas') content = /*#__PURE__*/React.createElement(window.PlantillasScreen, null);else if (view === 'admin') content = /*#__PURE__*/React.createElement(window.AdminScreen, null);else {
    const label = (window.SN5.nav.find(n => n.id === view) || {}).label || view;
    content = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionHero, {
      title: label
    }), /*#__PURE__*/React.createElement(window.Placeholder, {
      text: window.SN5.pendientes[view] || 'Pantalla pendiente de diseño.'
    }));
  }
  return /*#__PURE__*/React.createElement(AppShell, {
    sidebar: /*#__PURE__*/React.createElement(Sidebar, {
      items: window.SN5.nav,
      activeId: cotizacion ? 'cotizaciones' : view,
      onSelect: go
    }),
    topbar: /*#__PURE__*/React.createElement(Topbar, {
      user: window.SN5.user
    })
  }, content);
}
Object.assign(window, {
  App
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/CotizacionDetalleScreen.jsx
try { (() => {
/* 1.2 · Detalle de Cotización. Datos generales, partidas editables, totales en
   vivo y acciones que cambian según el estado. Reglas: "X Pagar" es neto al
   proveedor; el fee de agencia es 15% por default; el cliente paga 16% de IVA
   sobre subtotal+fee. */
const {
  Button,
  Card,
  Icon,
  Select,
  TextField,
  StatusBadge,
  SearchInput,
  DataTable
} = window.SerenataDesignSystem_993393;
const SN5_CATEGORIAS = ['Dirección', 'Producción', 'Post', 'Talento', 'Arte', 'Equipo', 'Viáticos'];
const SN5_CATALOGO = ['Dirección y guion', 'Equipo de cámara (3 días)', 'Locaciones y permisos', 'Postproducción y color', 'Música original', 'Casting principal (2 perfiles)', 'Diseño de arte y utilería', 'Drone y aéreas', 'Maquillaje y peinado'];
const SN5_RESPONSABLES = ['Julián López', 'Ana Vidal', 'Marta Quiroz', 'Hugo Peña', 'Paula Iriarte', 'Distrito Sonoro'];
function Cell({
  children,
  align,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      textAlign: align,
      ...style
    }
  }, children);
}
function InlineInput({
  value,
  onChange,
  align = 'left',
  suggestions,
  placeholder,
  width
}) {
  const [focus, setFocus] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const matches = suggestions && open && value ? suggestions.filter(s => s.toLowerCase().includes(String(value).toLowerCase()) && s !== value).slice(0, 5) : [];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: width || '100%'
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: value,
    onChange: e => {
      onChange(e.target.value);
      setOpen(true);
    },
    onFocus: () => setFocus(true),
    onBlur: () => {
      setFocus(false);
      setTimeout(() => setOpen(false), 120);
    },
    placeholder: placeholder,
    style: {
      width: '100%',
      height: 31,
      padding: '0 9px',
      textAlign: align,
      background: focus ? 'var(--surface-input)' : 'transparent',
      border: '1px solid ' + (focus ? 'var(--accent-quiet)' : 'transparent'),
      borderRadius: 'var(--radius-sm)',
      outline: 'none',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)',
      transition: 'var(--transition-control)'
    }
  }), matches.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'calc(100% + 3px)',
      left: 0,
      right: 0,
      zIndex: 15,
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      boxShadow: 'var(--shadow-raised)',
      overflow: 'hidden'
    }
  }, matches.map(m => /*#__PURE__*/React.createElement("div", {
    key: m,
    onMouseDown: () => {
      onChange(m);
      setOpen(false);
    },
    style: {
      padding: '8px 11px',
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)',
      cursor: 'pointer'
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = 'var(--surface-row-alt)';
      e.currentTarget.style.color = 'var(--text-body)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--text-muted)';
    }
  }, m))) : null);
}
function CotizacionDetalleScreen({
  cotizacion,
  onBack,
  onGo
}) {
  const base = window.SN5.cotizacion;
  const seed = cotizacion || base;
  const [estatus, setEstatus] = React.useState(seed.estatus || 'borrador');
  const [gen, setGen] = React.useState({
    cliente: seed.cliente || base.cliente,
    proyecto: seed.proyecto || base.proyecto,
    entrega: seed.entrega || base.entrega,
    locacion: base.locacion,
    notas: base.notas
  });
  const [partidas, setPartidas] = React.useState(base.partidas.map(p => ({
    ...p
  })));
  const [fee, setFee] = React.useState(base.fee);
  const [iva, setIva] = React.useState(base.iva);
  const [descTipo, setDescTipo] = React.useState('monto');
  const [desc, setDesc] = React.useState(0);
  const [confirm, setConfirm] = React.useState(false);
  const [copiar, setCopiar] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const editable = estatus === 'borrador' || estatus === 'emitida';
  const num = v => isNaN(parseFloat(v)) ? 0 : parseFloat(v);
  const subtotal = partidas.reduce((a, p) => a + num(p.cantidad) * num(p.precio), 0);
  const feeMonto = subtotal * num(fee) / 100;
  const preDesc = subtotal + feeMonto;
  const descMonto = descTipo === 'pct' ? preDesc * num(desc) / 100 : num(desc);
  const baseIva = Math.max(0, preDesc - descMonto);
  const ivaMonto = iva ? baseIva * 0.16 : 0;
  const total = baseIva + ivaMonto;
  const xPagarTotal = partidas.reduce((a, p) => a + num(p.xPagar), 0);
  const set = (i, k, v) => setPartidas(ps => ps.map((p, j) => j === i ? {
    ...p,
    [k]: v
  } : p));
  const addRow = () => setPartidas(ps => [...ps, {
    categoria: 'Producción',
    descripcion: '',
    cantidad: 1,
    precio: 0,
    responsable: '',
    xPagar: 0
  }]);
  const delRow = i => setPartidas(ps => ps.filter((_, j) => j !== i));
  const aplicarPlantilla = nombre => {
    if (!nombre) return;
    const t = window.SN5.plantillas.find(x => x.nombre === nombre);
    if (!t) return;
    setPartidas(ps => [...ps, ...t.items.map(x => ({
      ...x
    }))]);
    setToast({
      msg: 'Se precargaron ' + t.items.length + ' partidas de la plantilla "' + nombre + '".'
    });
  };
  const copiarDe = cot => {
    const i = window.SN5.cotizaciones.findIndex(x => x.folio === cot.folio);
    const t = window.SN5.plantillas[Math.abs(i) % window.SN5.plantillas.length];
    setPartidas(ps => [...ps, ...t.items.map(x => ({
      ...x
    }))]);
    setCopiar(false);
    setToast({
      msg: 'Se copiaron ' + t.items.length + ' partidas desde ' + cot.folio + ' · ' + cot.proyecto + '.'
    });
  };
  const GRID = '112px minmax(0,1.7fr) 62px 118px minmax(0,1fr) 118px 34px';
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "md",
    iconLeft: "arrow-left",
    onClick: onBack
  }, "Cotizaciones"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'var(--space-md)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h1", {
    className: "sn-display",
    style: {
      margin: 0,
      fontSize: 'var(--text-h2)'
    }
  }, seed.folio), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, "Cotizada el ", base.fecha), /*#__PURE__*/React.createElement(StatusBadge, {
    status: estatus
  }), seed.complementariaDe ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--accent)'
    }
  }, "Complementaria de ", seed.complementariaDe) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 12
    }
  }), /*#__PURE__*/React.createElement(window.Presence, {
    people: base.presencia
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-md)'
    }
  }, estatus === 'borrador' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg"
  }, "Guardar"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconLeft: "send",
    onClick: () => {
      setEstatus('emitida');
      setToast({
        msg: 'Cotización emitida y PDF generado.',
        link: 'Ver en Drive'
      });
    }
  }, "Generar cotizaci\xF3n")) : null, estatus === 'emitida' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg",
    onClick: () => setConfirm(true)
  }, "Cancelar"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    iconLeft: "printer",
    onClick: () => setToast({
      msg: 'PDF generado y guardado en Drive.',
      link: 'Abrir PDF'
    })
  }, "Generar PDF"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconLeft: "check",
    onClick: () => {
      setEstatus('aprobada');
      setToast({
        msg: 'Cotización aprobada. Se creó el proyecto y sus cuentas por cobrar y por pagar.',
        link: 'Ir al proyecto'
      });
    }
  }, "Aprobar cotizaci\xF3n")) : null, estatus === 'aprobada' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg",
    onClick: () => setConfirm(true)
  }, "Cancelar"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    iconLeft: "printer",
    onClick: () => setToast({
      msg: 'PDF generado y guardado en Drive.',
      link: 'Abrir PDF'
    })
  }, "Generar PDF"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconLeft: "git-branch",
    onClick: () => setToast({
      msg: 'Se creó la complementaria SH015, ligada a ' + seed.folio + '.',
      link: 'Abrir SH015'
    })
  }, "Crear complementaria")) : null, estatus === 'cancelada' ? /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    iconLeft: "printer"
  }, "Generar PDF") : null)), !editable ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      padding: '11px var(--space-lg)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--surface-row)',
      border: '1px solid var(--border-subtle)',
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "lock",
    size: 14
  }), "Los datos generales y las partidas s\xF3lo se editan en Borrador o Emitida.") : null, /*#__PURE__*/React.createElement(window.Panel, {
    title: "Datos generales"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(130px,200px)) 1fr auto',
      gap: 'var(--space-lg)',
      alignItems: 'start',
      minWidth: 0,
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement(window.Field, {
    label: "Cliente",
    nowrapLabel: true
  }, editable ? /*#__PURE__*/React.createElement(InlineInput, {
    value: gen.cliente,
    onChange: v => setGen({
      ...gen,
      cliente: v
    }),
    suggestions: ['Solura', 'Canal Norte', 'Vista Media', 'Grupo Alba', 'Nimbo', 'Lúmina', 'Terranova', 'Distrito'],
    placeholder: "Buscar o escribir nuevo\u2026"
  }) : /*#__PURE__*/React.createElement("span", null, gen.cliente)), /*#__PURE__*/React.createElement(window.Field, {
    label: "Proyecto",
    nowrapLabel: true
  }, editable ? /*#__PURE__*/React.createElement(InlineInput, {
    value: gen.proyecto,
    onChange: v => setGen({
      ...gen,
      proyecto: v
    }),
    suggestions: ['Campaña Verano 2025', 'Campaña Invierno 2024', 'Institucional Solura 2024'],
    placeholder: "Sugiere proyectos del cliente\u2026"
  }) : /*#__PURE__*/React.createElement("span", null, gen.proyecto)), /*#__PURE__*/React.createElement(window.Field, {
    label: "Fecha de entrega",
    nowrapLabel: true
  }, editable ? /*#__PURE__*/React.createElement(InlineInput, {
    value: gen.entrega,
    onChange: v => setGen({
      ...gen,
      entrega: v
    })
  }) : /*#__PURE__*/React.createElement("span", null, gen.entrega)), /*#__PURE__*/React.createElement(window.Field, {
    label: "Locaci\xF3n",
    nowrapLabel: true
  }, editable ? /*#__PURE__*/React.createElement(InlineInput, {
    value: gen.locacion,
    onChange: v => setGen({
      ...gen,
      locacion: v
    })
  }) : /*#__PURE__*/React.createElement("span", null, gen.locacion)), /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(window.Field, {
    label: "Fecha de cotizaci\xF3n",
    value: base.fecha,
    nowrapLabel: true
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(window.Field, {
    label: "Notas del evento \xB7 uso interno, no sale en el PDF"
  }, /*#__PURE__*/React.createElement("textarea", {
    value: gen.notas,
    onChange: e => setGen({
      ...gen,
      notas: e.target.value
    }),
    disabled: !editable,
    rows: 2,
    style: {
      width: '100%',
      padding: '10px 12px',
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      outline: 'none',
      resize: 'vertical',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)',
      lineHeight: 'var(--lh-body)'
    }
  })))), /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(window.Panel, {
    title: "Partidas",
    padding: "0",
    action: editable ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 'var(--space-md)'
      }
    }, /*#__PURE__*/React.createElement(Select, {
      size: "md",
      value: "",
      onChange: e => aplicarPlantilla(e.target.value),
      options: [{
        value: '',
        label: 'Plantilla de servicios…'
      }, ...window.SN5.plantillasServicios.map(p => ({
        value: p,
        label: p
      }))]
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "md",
      iconLeft: "copy",
      onClick: () => setCopiar(true)
    }, "Copiar de otra cotizaci\xF3n")) : null
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 880
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: GRID,
      gap: 'var(--space-md)',
      padding: '13px var(--row-pad-x)',
      borderBottom: '1px solid var(--border-subtle)',
      fontSize: 'var(--text-table-head)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--tracking-label)',
      textTransform: 'uppercase',
      color: 'var(--text-faint)'
    }
  }, /*#__PURE__*/React.createElement(Cell, null, "Categor\xEDa"), /*#__PURE__*/React.createElement(Cell, null, "Descripci\xF3n"), /*#__PURE__*/React.createElement(Cell, {
    align: "right"
  }, "Cant."), /*#__PURE__*/React.createElement(Cell, {
    align: "right"
  }, "P. unitario"), /*#__PURE__*/React.createElement(Cell, null, "Responsable"), /*#__PURE__*/React.createElement(Cell, {
    align: "right"
  }, "X pagar"), /*#__PURE__*/React.createElement(Cell, null)), partidas.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'grid',
      gridTemplateColumns: GRID,
      gap: 'var(--space-md)',
      alignItems: 'center',
      padding: '7px var(--row-pad-x)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Cell, null, editable ? /*#__PURE__*/React.createElement(Select, {
    size: "sm",
    value: p.categoria,
    onChange: e => set(i, 'categoria', e.target.value),
    options: SN5_CATEGORIAS,
    style: {
      width: '100%'
    }
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, p.categoria)), /*#__PURE__*/React.createElement(Cell, null, editable ? /*#__PURE__*/React.createElement(InlineInput, {
    value: p.descripcion,
    onChange: v => set(i, 'descripcion', v),
    suggestions: SN5_CATALOGO,
    placeholder: "Buscar en cat\xE1logo\u2026"
  }) : /*#__PURE__*/React.createElement("span", null, p.descripcion)), /*#__PURE__*/React.createElement(Cell, {
    align: "right"
  }, editable ? /*#__PURE__*/React.createElement(InlineInput, {
    value: p.cantidad,
    onChange: v => set(i, 'cantidad', v),
    align: "right"
  }) : /*#__PURE__*/React.createElement("span", null, p.cantidad)), /*#__PURE__*/React.createElement(Cell, {
    align: "right"
  }, editable ? /*#__PURE__*/React.createElement(InlineInput, {
    value: p.precio,
    onChange: v => set(i, 'precio', v),
    align: "right"
  }) : /*#__PURE__*/React.createElement("span", null, window.SN5_MXN(p.precio))), /*#__PURE__*/React.createElement(Cell, null, editable ? /*#__PURE__*/React.createElement(InlineInput, {
    value: p.responsable,
    onChange: v => set(i, 'responsable', v),
    suggestions: SN5_RESPONSABLES,
    placeholder: "Asignar\u2026"
  }) : /*#__PURE__*/React.createElement("span", null, p.responsable)), /*#__PURE__*/React.createElement(Cell, {
    align: "right"
  }, editable ? /*#__PURE__*/React.createElement(InlineInput, {
    value: p.xPagar,
    onChange: v => set(i, 'xPagar', v),
    align: "right"
  }) : /*#__PURE__*/React.createElement("span", null, window.SN5_MXN(p.xPagar))), /*#__PURE__*/React.createElement(Cell, {
    align: "right"
  }, editable ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => delRow(i),
    "aria-label": "Eliminar fila",
    style: {
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      color: 'var(--text-faint)',
      padding: 5
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash-2",
    size: 15
  })) : null))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-md)',
      padding: '13px var(--row-pad-x)'
    }
  }, editable ? /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "md",
    iconLeft: "plus",
    onClick: addRow
  }, "Agregar fila") : /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, "Total X pagar a responsables ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-primary)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, window.SN5_MXN(xPagarTotal)), " \xB7 neto, sin impuestos del proveedor"))))), /*#__PURE__*/React.createElement(window.Panel, {
    title: "Totales"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))',
      gap: 'var(--space-xl)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement(window.Field, {
    label: "Fee / margen de agencia"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: fee,
    onChange: e => setFee(e.target.value),
    disabled: !editable,
    style: {
      width: 64,
      height: 'var(--control-height)',
      padding: '0 11px',
      textAlign: 'right',
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      outline: 'none',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)'
    }
  }, "%"))), /*#__PURE__*/React.createElement(window.Field, {
    label: "Descuento"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: desc,
    onChange: e => setDesc(e.target.value),
    disabled: !editable,
    style: {
      flex: 1,
      minWidth: 0,
      height: 'var(--control-height)',
      padding: '0 11px',
      textAlign: 'right',
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      outline: 'none',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }), /*#__PURE__*/React.createElement(Select, {
    size: "md",
    value: descTipo,
    onChange: e => setDescTipo(e.target.value),
    options: [{
      value: 'monto',
      label: '$'
    }, {
      value: 'pct',
      label: '%'
    }]
  })))), /*#__PURE__*/React.createElement(window.Checkbox, {
    checked: iva,
    onChange: editable ? setIva : () => {},
    label: "IVA 16% sobre subtotal + fee"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      fontSize: 'var(--text-md)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      color: 'var(--text-faint)'
    }
  }, "Margen Serenata estimado"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)'
    }
  }, window.SN5_MXN(subtotal + feeMonto - xPagarTotal)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 11
    }
  }, [['Subtotal', subtotal], ['Fee de agencia · ' + num(fee) + '%', feeMonto], descMonto ? ['Descuento', -descMonto] : null, ['General', baseIva], ['IVA 16%', ivaMonto]].filter(Boolean).map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      fontSize: 'var(--text-base)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      color: l === 'General' ? 'var(--text-body)' : 'var(--text-muted)',
      fontWeight: l === 'General' ? 'var(--weight-semibold)' : 'var(--weight-regular)'
    }
  }, l), /*#__PURE__*/React.createElement("span", {
    style: {
      color: l === 'General' ? 'var(--text-primary)' : 'var(--text-body)',
      fontWeight: l === 'General' ? 'var(--weight-semibold)' : 'var(--weight-regular)'
    }
  }, window.SN5_MXN(v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'var(--space-md)',
      paddingTop: 'var(--space-md)',
      borderTop: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sn-label",
    style: {
      flex: 1,
      minWidth: 0
    }
  }, "Total final"), /*#__PURE__*/React.createElement("span", {
    className: "sn-display",
    style: {
      fontSize: 'var(--text-h2)',
      color: 'var(--accent)'
    }
  }, window.SN5_MXN_L(total))))))), copiar ? /*#__PURE__*/React.createElement(window.Modal, {
    title: "Copiar desde otra cotizaci\xF3n",
    eyebrow: "Partidas",
    width: 860,
    onClose: () => setCopiar(false)
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 var(--space-lg)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-muted)'
    }
  }, "Elige una cotizaci\xF3n y sus partidas se agregan a esta. Los datos generales no se copian."), /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    tone: "row"
  }, /*#__PURE__*/React.createElement(DataTable, {
    minWidth: 0,
    onRowClick: copiarDe,
    columns: [{
      key: 'folio',
      label: 'Folio',
      width: '90px',
      render: r => /*#__PURE__*/React.createElement(window.Folio, null, r.folio)
    }, {
      key: 'proyecto',
      label: 'Proyecto',
      width: '1.5fr',
      strong: true
    }, {
      key: 'cliente',
      label: 'Cliente',
      width: '1fr'
    }, {
      key: 'total',
      label: 'Total',
      width: '1fr',
      align: 'right',
      render: r => window.SN5_MXN(r.total)
    }, {
      key: 'estatus',
      label: 'Estatus',
      width: '120px',
      align: 'right',
      render: r => /*#__PURE__*/React.createElement(StatusBadge, {
        status: r.estatus
      })
    }],
    rows: window.SN5.cotizaciones.filter(r => r.folio !== seed.folio && !r.sinItems),
    emptyLabel: "No hay otra cotizaci\xF3n con partidas"
  }))) : null, confirm ? /*#__PURE__*/React.createElement(window.Modal, {
    title: "Cancelar cotizaci\xF3n",
    eyebrow: seed.folio,
    width: 520,
    onClose: () => setConfirm(false),
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "lg",
      onClick: () => setConfirm(false)
    }, "Mantener"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      onClick: () => {
        setEstatus('cancelada');
        setConfirm(false);
        setToast({
          msg: 'Cotización cancelada. Se revirtió el proyecto y sus cuentas.'
        });
      }
    }, "S\xED, cancelar"))
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)',
      lineHeight: 'var(--lh-body)'
    }
  }, "Al cancelar esta cotizaci\xF3n se borra el proyecto ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--text-primary)'
    }
  }, gen.proyecto), " y todas las cuentas por cobrar y por pagar ligadas a \xE9l. La acci\xF3n no se puede deshacer desde esta pantalla.")) : null, /*#__PURE__*/React.createElement(window.Toast, {
    onClose: () => setToast(null),
    link: toast && toast.link
  }, toast && toast.msg));
}
Object.assign(window, {
  CotizacionDetalleScreen,
  InlineInput: InlineInput,
  SN5_CATEGORIAS,
  SN5_CATALOGO,
  SN5_RESPONSABLES
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/CotizacionDetalleScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/CotizacionesScreen.jsx
try { (() => {
/* 1.1 · Lista de Cotizaciones. Filtro por estado con conteo, buscador por
   folio/cliente/proyecto, etiqueta de complementaria y alerta "Sin items". */
const {
  Button,
  SearchInput,
  FilterButton,
  FilterTabs,
  Card,
  Icon,
  DataTable,
  TableFooter,
  StatusBadge,
  SectionHero
} = window.SerenataDesignSystem_993393;
function CotizacionesScreen({
  onOpen,
  onNueva
}) {
  const all = window.SN5.cotizaciones;
  const [tab, setTab] = React.useState('todas');
  const [q, setQ] = React.useState('');
  const count = id => all.filter(c => c.estatus === id).length;
  const tabs = [{
    id: 'todas',
    label: 'Todas',
    count: all.length
  }, {
    id: 'borrador',
    label: 'Borrador',
    count: count('borrador')
  }, {
    id: 'emitida',
    label: 'Emitida',
    count: count('emitida')
  }, {
    id: 'aprobada',
    label: 'Aprobada',
    count: count('aprobada')
  }, {
    id: 'cancelada',
    label: 'Cancelada',
    count: count('cancelada')
  }];
  const rows = all.filter(c => {
    if (tab !== 'todas' && c.estatus !== tab) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (c.folio + ' ' + c.cliente + ' ' + c.proyecto).toLowerCase().includes(t);
  });
  const columns = [{
    key: 'folio',
    label: 'Folio',
    width: '150px',
    render: r => /*#__PURE__*/React.createElement(window.Folio, null, r.folio)
  }, {
    key: 'proyecto',
    label: 'Proyecto',
    width: '1.5fr',
    render: r => /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 'var(--weight-medium)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, r.proyecto), r.complementariaDe ? /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-xs)',
        color: 'var(--accent)',
        letterSpacing: '0.02em',
        marginTop: 2
      }
    }, "Complementaria de ", r.complementariaDe) : null)
  }, {
    key: 'cliente',
    label: 'Cliente',
    width: '1fr'
  }, {
    key: 'total',
    label: 'Total',
    width: '1fr',
    align: 'right',
    render: r => r.sinItems ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        color: 'var(--sn-status-cancelled-fg)',
        fontSize: 'var(--text-md)'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "alert-triangle",
      size: 14
    }), "Sin items") : /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-primary)',
        fontWeight: 'var(--weight-medium)'
      }
    }, window.SN5_MXN(r.total))
  }, {
    key: 'entrega',
    label: 'Entrega',
    width: '1fr'
  }, {
    key: 'estatus',
    label: 'Estatus',
    width: '124px',
    align: 'right',
    render: r => /*#__PURE__*/React.createElement(StatusBadge, {
      status: r.estatus
    })
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionHero, {
    title: "Cotizaciones",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      iconLeft: "plus",
      onClick: onNueva
    }, "Nueva cotizaci\xF3n")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(SearchInput, {
    size: "lg",
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Buscar por folio, cliente o proyecto\u2026",
    style: {
      flex: '0 1 420px',
      minWidth: 240
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      flexWrap: 'nowrap',
      minWidth: 0,
      overflowX: 'auto',
      paddingBottom: 2
    }
  }, /*#__PURE__*/React.createElement(FilterTabs, {
    tabs: tabs,
    value: tab,
    onChange: setTab,
    style: {
      flex: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 12
    }
  }), /*#__PURE__*/React.createElement(FilterButton, {
    style: {
      flex: 'none'
    }
  })), /*#__PURE__*/React.createElement(Card, {
    padding: "0"
  }, /*#__PURE__*/React.createElement(DataTable, {
    columns: columns,
    rows: rows,
    onRowClick: onOpen,
    emptyLabel: "Ninguna cotizaci\xF3n coincide con el filtro"
  }), /*#__PURE__*/React.createElement(TableFooter, {
    shown: rows.length,
    total: all.length,
    unit: "cotizaciones"
  })));
}
Object.assign(window, {
  CotizacionesScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/CotizacionesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/CuentasScreen.jsx
try { (() => {
/* 3 · Cuentas por Cobrar y por Pagar (Fase 5.3). Vista agrupada por proyecto
   como navegación principal, lista plana como alternativa, cruce fiscal
   proyectado vs. real con los dos escenarios de proveedor, y la ficha semanal
   de órdenes de pago para contabilidad.

   Escenario A · persona moral: IVA 16% acreditable.
   Escenario B · persona física con honorarios: IVA 16%, retención de IVA de
   2/3 (10.6667%) y retención de ISR de 10%, ambas sobre el subtotal.
   La base siempre es "X Pagar" (neto); el proveedor agrega sus impuestos. */
const {
  Button,
  Card,
  Icon,
  Avatar,
  Select,
  SearchInput,
  FilterButton,
  FilterTabs,
  DataTable,
  TableFooter,
  TextField,
  SectionHero
} = window.SerenataDesignSystem_993393;
function sn5Fiscal(neto, regimen) {
  const iva = neto * 0.16;
  if (regimen === 'moral') return {
    neto,
    iva,
    retIva: 0,
    retIsr: 0,
    pago: neto + iva
  };
  const retIva = neto * (2 / 3) * 0.16;
  const retIsr = neto * 0.10;
  return {
    neto,
    iva,
    retIva,
    retIsr,
    pago: neto + iva - retIva - retIsr
  };
}
function DocSection({
  docs
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)'
    }
  }, docs.map(d => /*#__PURE__*/React.createElement("div", {
    key: d.nombre,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: '13px var(--space-lg)',
      background: 'var(--surface-row)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: d.tipo === 'xml' ? 'file-code' : 'file-text',
    size: 16,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }, d.nombre), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-faint)',
      marginTop: 2
    }
  }, d.rol, " \xB7 ", d.fecha)), /*#__PURE__*/React.createElement(window.SNBadge, {
    state: d.estado
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "md",
    iconLeft: d.estado === 'pendiente' ? 'upload' : 'download'
  }, d.estado === 'pendiente' ? 'Subir' : 'Ver'))));
}
function CuentaModal({
  cuenta,
  tipo,
  onClose
}) {
  const [tab, setTab] = React.useState('info');
  const [responsable, setResponsable] = React.useState(cuenta.responsable);
  const [monto, setMonto] = React.useState('');
  const f = tipo === 'pagar' ? sn5Fiscal(cuenta.total, cuenta.regimen) : null;
  const docs = tipo === 'cobrar' ? [{
    nombre: 'Factura ' + cuenta.folio + '.xml',
    rol: 'Factura al cliente',
    tipo: 'xml',
    estado: 'validado',
    fecha: '26 abr 2025'
  }, {
    nombre: 'Factura ' + cuenta.folio + '.pdf',
    rol: 'Factura al cliente',
    estado: 'validado',
    fecha: '26 abr 2025'
  }, {
    nombre: 'Complemento de pago',
    rol: 'Emitido tras el cobro',
    estado: cuenta.pagado ? 'validado' : 'pendiente',
    fecha: cuenta.pagado ? '30 abr 2025' : '—'
  }, {
    nombre: 'Comprobante de transferencia',
    rol: 'Soporte del pago recibido',
    estado: cuenta.pagado ? 'validado' : 'pendiente',
    fecha: cuenta.pagado ? '30 abr 2025' : '—'
  }] : [{
    nombre: 'Factura del proveedor.xml',
    rol: 'Emitida por ' + cuenta.responsable,
    tipo: 'xml',
    estado: cuenta.pagado ? 'validado' : 'revision',
    fecha: '24 abr 2025'
  }, {
    nombre: 'Factura del proveedor.pdf',
    rol: 'Emitida por ' + cuenta.responsable,
    estado: cuenta.pagado ? 'validado' : 'revision',
    fecha: '24 abr 2025'
  }, {
    nombre: 'Comprobante de pago',
    rol: 'Soporte del pago emitido',
    estado: cuenta.pagado ? 'validado' : 'pendiente',
    fecha: cuenta.pagado ? '28 abr 2025' : '—'
  }];
  return /*#__PURE__*/React.createElement(window.Modal, {
    title: cuenta.proyecto,
    eyebrow: cuenta.folio + ' · ' + (tipo === 'cobrar' ? cuenta.cliente : cuenta.responsable),
    width: 860,
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(window.SNBadge, {
      state: cuenta.estado
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), tipo === 'pagar' ? /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "lg",
      iconLeft: "file-text"
    }, "Ver orden de pago") : null, /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      onClick: onClose
    }, "Cerrar"))
  }, /*#__PURE__*/React.createElement(FilterTabs, {
    tabs: [{
      id: 'info',
      label: 'Información'
    }, {
      id: 'docs',
      label: 'Documentos'
    }, {
      id: 'pago',
      label: 'Registrar pago'
    }],
    value: tab,
    onChange: setTab,
    style: {
      marginBottom: 'var(--space-lg)'
    }
  }), tab === 'info' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(window.Field, {
    label: "Folio"
  }, /*#__PURE__*/React.createElement(window.Folio, {
    size: 15
  }, cuenta.folio)), /*#__PURE__*/React.createElement(window.Field, {
    label: "Proyecto",
    value: cuenta.proyecto
  }), tipo === 'cobrar' ? /*#__PURE__*/React.createElement(window.Field, {
    label: "Cliente",
    value: cuenta.cliente
  }) : /*#__PURE__*/React.createElement(window.Field, {
    label: "Responsable / proveedor"
  }, /*#__PURE__*/React.createElement(Select, {
    size: "md",
    value: responsable,
    onChange: e => setResponsable(e.target.value),
    options: ['Julián López', 'Ana Vidal', 'Marta Quiroz', 'Hugo Peña', 'Paula Iriarte', 'Distrito Sonoro'],
    style: {
      width: '100%'
    }
  })), /*#__PURE__*/React.createElement(window.Field, {
    label: "Total",
    value: window.SN5_MXN_L(cuenta.total)
  }), /*#__PURE__*/React.createElement(window.Field, {
    label: "Pagado",
    value: window.SN5_MXN_L(cuenta.pagado)
  }), /*#__PURE__*/React.createElement(window.Field, {
    label: tipo === 'cobrar' ? 'Vencimiento' : 'Concepto',
    value: tipo === 'cobrar' ? cuenta.vencimiento : cuenta.descripcion
  })), tipo === 'pagar' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      padding: '11px var(--space-lg)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--surface-row)',
      border: '1px solid var(--border-subtle)',
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "link",
    size: 14
  }), "Cambiar el responsable aqu\xED tambi\xE9n lo actualiza en la partida del proyecto. Nunca quedan desincronizados."), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sn-label",
    style: {
      marginBottom: 11
    }
  }, "Cruce fiscal \xB7 escenario ", cuenta.regimen === 'moral' ? 'A · persona moral' : 'B · persona física con honorarios'), /*#__PURE__*/React.createElement(Card, {
    tone: "row",
    padding: "var(--space-lg)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 11
    }
  }, [['X pagar · neto al proveedor', f.neto], ['IVA 16% que agrega el proveedor', f.iva], cuenta.regimen === 'fisica' ? ['Retención de IVA · 2/3 (10.6667%)', -f.retIva] : null, cuenta.regimen === 'fisica' ? ['Retención de ISR · 10%', -f.retIsr] : null].filter(Boolean).map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      gap: 'var(--space-md)',
      fontSize: 'var(--text-base)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      color: 'var(--text-muted)'
    }
  }, l), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-body)'
    }
  }, window.SN5_MXN(v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-md)',
      alignItems: 'baseline',
      paddingTop: 'var(--space-md)',
      borderTop: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, "Total a transferir"), /*#__PURE__*/React.createElement("span", {
    className: "sn-display",
    style: {
      fontSize: 'var(--text-h3)',
      color: 'var(--text-primary)'
    }
  }, window.SN5_MXN(f.pago))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      fontSize: 'var(--text-md)',
      color: 'var(--sn-status-approved-fg)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14
  }), "La factura recibida coincide con el monto esperado y el impuesto corresponde al r\xE9gimen."))))) : null) : null, tab === 'docs' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)',
      lineHeight: 'var(--lh-snug)'
    }
  }, "Cada documento dice a qu\xE9 corresponde, su estado de validaci\xF3n y su fecha."), /*#__PURE__*/React.createElement(DocSection, {
    docs: docs
  })) : null, tab === 'pago' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    label: "Monto",
    value: monto,
    onChange: e => setMonto(e.target.value),
    placeholder: String(cuenta.total - cuenta.pagado),
    hint: 'Saldo pendiente ' + window.SN5_MXN(cuenta.total - cuenta.pagado)
  }), /*#__PURE__*/React.createElement(window.Field, {
    label: "Tipo de pago"
  }, /*#__PURE__*/React.createElement(Select, {
    size: "md",
    options: ['Transferencia', 'Cheque', 'Efectivo', 'Tarjeta'],
    style: {
      width: '100%'
    }
  })), /*#__PURE__*/React.createElement(TextField, {
    label: "Fecha del pago",
    defaultValue: "30 abr 2025"
  }), /*#__PURE__*/React.createElement(window.Field, {
    label: "Comprobante"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "md",
    iconLeft: "upload",
    fullWidth: true
  }, "Adjuntar archivo")), /*#__PURE__*/React.createElement(window.Field, {
    label: "Notas",
    span: 2
  }, /*#__PURE__*/React.createElement("textarea", {
    rows: 3,
    placeholder: "Referencia bancaria, acuerdos, etc.",
    style: {
      width: '100%',
      padding: '10px 12px',
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      outline: 'none',
      resize: 'vertical',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: 'span 2',
      display: 'flex',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconLeft: "check"
  }, "Registrar pago"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg"
  }, "Marcar como pagada por contabilidad"))) : null);
}
function FichaOrdenes({
  onClose
}) {
  const pendientes = window.SN5.cuentasPagar.filter(c => c.estado !== 'PAGADO');
  const porResp = {};
  pendientes.forEach(c => {
    porResp[c.responsable] = porResp[c.responsable] || [];
    porResp[c.responsable].push(c);
  });
  const granTotal = pendientes.reduce((a, c) => a + sn5Fiscal(c.total, c.regimen).pago, 0);
  return /*#__PURE__*/React.createElement(window.Modal, {
    title: "Ficha de \xF3rdenes de pago",
    eyebrow: "Semana del 28 abr \u2014 04 may 2025",
    width: 880,
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "sn-label"
    }, "Total de la semana"), /*#__PURE__*/React.createElement("div", {
      className: "sn-display",
      style: {
        fontSize: 'var(--text-h3)',
        color: 'var(--accent)'
      }
    }, window.SN5_MXN_L(granTotal))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "lg",
      iconLeft: "send"
    }, "Enviar a contabilidad"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      iconLeft: "printer"
    }, "Generar PDF"))
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 var(--space-lg)',
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)',
      lineHeight: 'var(--lh-snug)'
    }
  }, "Agrupa las cuentas pendientes de proyectos ya cerrados. Un proyecto se cierra el d\xEDa siguiente a su fecha de entrega."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, Object.keys(porResp).map(resp => {
    const items = porResp[resp];
    const sub = items.reduce((a, c) => a + sn5Fiscal(c.total, c.regimen).pago, 0);
    const regimen = items[0].regimen;
    return /*#__PURE__*/React.createElement(Card, {
      key: resp,
      padding: "0",
      tone: "row"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
        padding: '13px var(--space-lg)',
        borderBottom: '1px solid var(--border-subtle)'
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      initials: resp.split(' ').map(w => w[0]).join(''),
      size: 30
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-lg)',
        fontWeight: 'var(--weight-semibold)',
        color: 'var(--text-primary)'
      }
    }, resp), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-xs)',
        color: 'var(--text-faint)'
      }
    }, "BBVA \xB7 CLABE 0123 2000 4512 3789 01 \xB7 ", regimen === 'moral' ? 'Persona moral' : 'Persona física, honorarios')), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "sn-label"
    }, "Subtotal"), /*#__PURE__*/React.createElement("div", {
      className: "sn-display",
      style: {
        fontSize: 'var(--text-h3)'
      }
    }, window.SN5_MXN(sub)))), items.map((c, i) => {
      const fi = sn5Fiscal(c.total, c.regimen);
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-md)',
          padding: '11px var(--space-lg)',
          borderBottom: i === items.length - 1 ? 0 : '1px solid var(--border-subtle)',
          fontSize: 'var(--text-base)'
        }
      }, /*#__PURE__*/React.createElement(window.Folio, {
        size: 12,
        color: "var(--text-faint)"
      }, c.folio), /*#__PURE__*/React.createElement("span", {
        style: {
          flex: 1,
          minWidth: 0,
          color: 'var(--text-body)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }
      }, c.proyecto, " \xB7 ", c.descripcion), /*#__PURE__*/React.createElement("span", {
        style: {
          color: 'var(--text-muted)',
          fontSize: 'var(--text-md)'
        }
      }, "neto ", window.SN5_MXN(c.total)), /*#__PURE__*/React.createElement("span", {
        style: {
          color: 'var(--text-primary)',
          fontWeight: 'var(--weight-medium)',
          minWidth: 96,
          textAlign: 'right'
        }
      }, window.SN5_MXN(fi.pago)));
    }));
  })));
}
function PorProyecto({
  onOpen
}) {
  const proyectos = window.SN5.proyectos;
  const [abierto, setAbierto] = React.useState(proyectos[0].folio);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)'
    }
  }, proyectos.map(p => {
    const cobrar = window.SN5.cuentasCobrar.filter(c => c.folio === p.folio);
    const pagar = window.SN5.cuentasPagar.filter(c => c.folio === p.folio);
    if (!cobrar.length && !pagar.length) return null;
    const abrir = abierto === p.folio;
    const totalCobrar = cobrar.reduce((a, c) => a + (c.total - c.pagado), 0);
    const totalPagar = pagar.reduce((a, c) => a + (c.total - c.pagado), 0);
    return /*#__PURE__*/React.createElement(Card, {
      key: p.folio,
      padding: "0"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setAbierto(abrir ? null : p.folio),
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-lg)',
        padding: '15px var(--space-lg)',
        background: 'transparent',
        border: 0,
        cursor: 'pointer',
        textAlign: 'left'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: abrir ? 'chevron-down' : 'chevron-right',
      size: 16,
      color: "var(--text-muted)"
    }), /*#__PURE__*/React.createElement(window.Folio, null, p.folio), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-lg)',
        fontWeight: 'var(--weight-semibold)',
        color: 'var(--text-primary)'
      }
    }, p.nombre), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-md)',
        color: 'var(--text-muted)'
      }
    }, p.cliente), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-md)',
        color: 'var(--text-muted)'
      }
    }, "Por cobrar ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--accent)',
        fontWeight: 'var(--weight-semibold)'
      }
    }, window.SN5_MXN(totalCobrar))), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-md)',
        color: 'var(--text-muted)'
      }
    }, "Por pagar ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-primary)',
        fontWeight: 'var(--weight-semibold)'
      }
    }, window.SN5_MXN(totalPagar))), /*#__PURE__*/React.createElement(window.SNBadge, {
      state: p.estado
    })), abrir ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))',
        gap: 'var(--space-lg)',
        padding: 'var(--space-lg)',
        borderTop: '1px solid var(--border-subtle)'
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "sn-label",
      style: {
        marginBottom: 11
      }
    }, "Por cobrar"), /*#__PURE__*/React.createElement(Card, {
      tone: "row",
      padding: "0"
    }, /*#__PURE__*/React.createElement(DataTable, {
      minWidth: 0,
      columns: [{
        key: 'cliente',
        label: 'Cliente',
        width: '1fr',
        strong: true
      }, {
        key: 'pagado',
        label: 'Pagado / total',
        width: '1.1fr',
        align: 'right',
        render: r => window.SN5_MXN(r.pagado) + ' / ' + window.SN5_MXN(r.total)
      }, {
        key: 'estado',
        label: 'Estado',
        width: '132px',
        align: 'right',
        render: r => /*#__PURE__*/React.createElement(window.SNBadge, {
          state: r.estado
        })
      }],
      rows: cobrar,
      onRowClick: r => onOpen(r, 'cobrar'),
      emptyLabel: "Sin cuentas por cobrar"
    }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "sn-label",
      style: {
        marginBottom: 11
      }
    }, "Por pagar"), /*#__PURE__*/React.createElement(Card, {
      tone: "row",
      padding: "0"
    }, /*#__PURE__*/React.createElement(DataTable, {
      minWidth: 0,
      columns: [{
        key: 'responsable',
        label: 'Responsable',
        width: '1fr',
        strong: true
      }, {
        key: 'total',
        label: 'X pagar',
        width: '1fr',
        align: 'right',
        render: r => window.SN5_MXN(r.total)
      }, {
        key: 'estado',
        label: 'Estado',
        width: '132px',
        align: 'right',
        render: r => /*#__PURE__*/React.createElement(window.SNBadge, {
          state: r.estado
        })
      }],
      rows: pagar,
      onRowClick: r => onOpen(r, 'pagar'),
      emptyLabel: "Sin cuentas por pagar"
    })))) : null);
  }));
}
function CuentasScreen() {
  const [tab, setTab] = React.useState('cobrar');
  const [vista, setVista] = React.useState('proyecto');
  const [q, setQ] = React.useState('');
  const [modal, setModal] = React.useState(null);
  const [ficha, setFicha] = React.useState(false);
  const cobrar = window.SN5.cuentasCobrar;
  const pagar = window.SN5.cuentasPagar;
  const openCuenta = (c, t) => setModal({
    cuenta: c,
    tipo: t
  });
  const pendCobrar = cobrar.filter(c => c.estado !== 'PAGADO').length;
  const pendPagar = pagar.filter(c => c.estado !== 'PAGADO').length;
  const metricasCobrar = [{
    label: 'Pendiente',
    valor: window.SN5_MXN(cobrar.reduce((a, c) => a + (c.total - c.pagado), 0)),
    nota: pendCobrar + ' cuentas',
    accent: true
  }, {
    label: 'Cobrado',
    valor: window.SN5_MXN(cobrar.reduce((a, c) => a + c.pagado, 0)),
    nota: 'En el periodo'
  }, {
    label: 'Alertas',
    valor: String(cobrar.filter(c => c.estado === 'VENCIDO').length),
    nota: 'Cuentas vencidas'
  }];
  const metricasPagar = [{
    label: 'Pendiente',
    valor: window.SN5_MXN(pagar.reduce((a, c) => a + (c.total - c.pagado), 0)),
    nota: pendPagar + ' cuentas',
    accent: true
  }, {
    label: 'Pagado',
    valor: window.SN5_MXN(pagar.reduce((a, c) => a + c.pagado, 0)),
    nota: 'En el periodo'
  }];
  const colsCobrar = [{
    key: 'folio',
    label: 'Folio',
    width: '90px',
    render: r => /*#__PURE__*/React.createElement(window.Folio, null, r.folio)
  }, {
    key: 'cliente',
    label: 'Cliente',
    width: '1fr',
    strong: true
  }, {
    key: 'proyecto',
    label: 'Proyecto',
    width: '1.4fr'
  }, {
    key: 'pagado',
    label: 'Pagado / total',
    width: '1.2fr',
    align: 'right',
    render: r => /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-primary)'
      }
    }, window.SN5_MXN(r.pagado)), " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-faint)'
      }
    }, "/ ", window.SN5_MXN(r.total)))
  }, {
    key: 'vencimiento',
    label: 'Vencimiento',
    width: '1fr'
  }, {
    key: 'estado',
    label: 'Estado',
    width: '140px',
    align: 'right',
    render: r => /*#__PURE__*/React.createElement(window.SNBadge, {
      state: r.estado
    })
  }];
  const colsPagar = [{
    key: 'folio',
    label: 'Folio',
    width: '90px',
    render: r => /*#__PURE__*/React.createElement(window.Folio, null, r.folio)
  }, {
    key: 'proyecto',
    label: 'Proyecto',
    width: '1.3fr',
    strong: true
  }, {
    key: 'responsable',
    label: 'Responsable',
    width: '1fr'
  }, {
    key: 'descripcion',
    label: 'Descripción',
    width: '1.3fr'
  }, {
    key: 'pagado',
    label: 'Pagado / total',
    width: '1.2fr',
    align: 'right',
    render: r => /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-primary)'
      }
    }, window.SN5_MXN(r.pagado)), " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-faint)'
      }
    }, "/ ", window.SN5_MXN(r.total)))
  }, {
    key: 'estado',
    label: 'Estado',
    width: '132px',
    align: 'right',
    render: r => /*#__PURE__*/React.createElement(window.SNBadge, {
      state: r.estado
    })
  }];
  const rows = (tab === 'cobrar' ? cobrar : pagar).filter(c => {
    const t = q.trim().toLowerCase();
    return !t || JSON.stringify(c).toLowerCase().includes(t);
  });
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionHero, {
    title: "Cuentas",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      iconLeft: "file-text",
      onClick: () => setFicha(true)
    }, "Ficha de \xF3rdenes de pago")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      flexWrap: 'wrap',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(SearchInput, {
    size: "lg",
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Buscar por folio, proyecto o responsable\u2026",
    style: {
      flex: '0 1 420px',
      minWidth: 240
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 12
    }
  }), /*#__PURE__*/React.createElement(FilterButton, {
    style: {
      flex: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      flexWrap: 'nowrap',
      minWidth: 0,
      overflowX: 'auto',
      paddingBottom: 2
    }
  }, /*#__PURE__*/React.createElement(FilterTabs, {
    tabs: [{
      id: 'cobrar',
      label: 'Cobrar',
      count: pendCobrar
    }, {
      id: 'pagar',
      label: 'Pagar',
      count: pendPagar
    }],
    value: tab,
    onChange: setTab,
    style: {
      flex: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 12
    }
  }), /*#__PURE__*/React.createElement(FilterTabs, {
    tabs: [{
      id: 'proyecto',
      label: 'Por proyecto'
    }, {
      id: 'lista',
      label: 'Lista'
    }],
    value: vista,
    onChange: setVista,
    style: {
      flex: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, (tab === 'cobrar' ? metricasCobrar : metricasPagar).map(m => /*#__PURE__*/React.createElement(window.Metric, {
    key: m.label,
    label: m.label,
    value: m.valor,
    nota: m.nota,
    accent: m.accent
  }))), vista === 'proyecto' ? /*#__PURE__*/React.createElement(PorProyecto, {
    onOpen: openCuenta
  }) : /*#__PURE__*/React.createElement(Card, {
    padding: "0"
  }, /*#__PURE__*/React.createElement(DataTable, {
    columns: tab === 'cobrar' ? colsCobrar : colsPagar,
    rows: rows,
    onRowClick: r => openCuenta(r, tab),
    emptyLabel: "Ninguna cuenta coincide"
  }), /*#__PURE__*/React.createElement(TableFooter, {
    shown: rows.length,
    total: (tab === 'cobrar' ? cobrar : pagar).length,
    unit: "cuentas"
  })), tab === 'cobrar' ? /*#__PURE__*/React.createElement(window.Panel, {
    title: "Alertas de cobro"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)'
    }
  }, cobrar.filter(c => c.estado === 'VENCIDO' || c.estado === 'FACTURA_PENDIENTE').map(c => /*#__PURE__*/React.createElement("div", {
    key: c.folio,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: '13px var(--space-lg)',
      borderRadius: 'var(--radius-sm)',
      background: c.estado === 'VENCIDO' ? 'var(--sn-status-cancelled-bg)' : 'var(--surface-row)',
      border: '1px solid var(--border-subtle)',
      color: c.estado === 'VENCIDO' ? 'var(--sn-status-cancelled-fg)' : 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: c.estado === 'VENCIDO' ? 'alert-triangle' : 'clock',
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-base)'
    }
  }, c.estado === 'VENCIDO' ? c.cliente + ' · ' + c.proyecto + ' venció el ' + c.vencimiento : c.cliente + ' · ' + c.proyecto + ' sigue sin factura emitida'), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-base)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, window.SN5_MXN(c.total - c.pagado)), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "md",
    onClick: () => openCuenta(c, 'cobrar')
  }, "Abrir"))))) : /*#__PURE__*/React.createElement(window.Panel, {
    title: "Historial de \xF3rdenes",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "md",
      onClick: () => setFicha(true),
      iconRight: "arrow-right"
    }, "Nueva ficha")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)'
    }
  }, [{
    semana: 'Semana del 21 — 27 abr 2025',
    total: 186000,
    resp: 3
  }, {
    semana: 'Semana del 14 — 20 abr 2025',
    total: 244000,
    resp: 4
  }, {
    semana: 'Semana del 07 — 13 abr 2025',
    total: 98000,
    resp: 2
  }].map(o => /*#__PURE__*/React.createElement("div", {
    key: o.semana,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: '13px var(--space-lg)',
      background: 'var(--surface-row)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-text",
    size: 16,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }, o.semana), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, o.resp, " responsables"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-primary)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, window.SN5_MXN(o.total)), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "md",
    iconLeft: "download"
  }, "PDF"))))), modal ? /*#__PURE__*/React.createElement(CuentaModal, {
    cuenta: modal.cuenta,
    tipo: modal.tipo,
    onClose: () => setModal(null)
  }) : null, ficha ? /*#__PURE__*/React.createElement(FichaOrdenes, {
    onClose: () => setFicha(false)
  }) : null);
}
Object.assign(window, {
  CuentasScreen,
  sn5Fiscal
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/CuentasScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/DashboardScreen.jsx
try { (() => {
/* 5 · Dashboard Ejecutivo (Fase 5.6). Cada gráfica y tarjeta navega a su
   sección de detalle. El manejo de error es por fuente: si una falla, el resto
   del dashboard sigue funcionando. */
const {
  Card,
  Button,
  Icon,
  Select,
  DataTable,
  StatusBadge
} = window.SerenataDesignSystem_993393;
const {
  SectionHero
} = window.SerenataDesignSystem_993393;
function FuenteError({
  nombre,
  onRetry
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: 'var(--space-lg)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--sn-status-cancelled-bg)',
      color: 'var(--sn-status-cancelled-fg)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert-triangle",
    size: 17
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-base)'
    }
  }, "No se pudo cargar ", nombre, ". El resto del dashboard sigue disponible."), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "md",
    onClick: onRetry
  }, "Reintentar"));
}
function CoberturaMes({
  gastos,
  facturado
}) {
  const total = gastos.reduce((a, g) => a + g.monto, 0);
  const cobertura = Math.min(100, facturado / total * 100);
  const excedente = facturado - total;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 11
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sn-display",
    style: {
      fontSize: 'var(--text-h2)',
      color: excedente >= 0 ? 'var(--sn-status-approved-fg)' : 'var(--accent)'
    }
  }, excedente >= 0 ? '+' : '−', window.SN5_MXN(Math.abs(excedente))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, Math.round(cobertura), "% cubierto")), /*#__PURE__*/React.createElement(window.ProgressBar, {
    value: cobertura,
    height: 7,
    tone: excedente >= 0 ? 'var(--sn-status-approved-bg)' : 'var(--accent)'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 11
    }
  }, gastos.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      fontSize: 'var(--text-base)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      color: 'var(--text-muted)'
    }
  }, g.label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-body)'
    }
  }, window.SN5_MXN(g.monto)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      paddingTop: 12,
      borderTop: '1px solid var(--border-subtle)',
      fontSize: 'var(--text-base)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      color: 'var(--text-body)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, "Gastos fijos del mes"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-primary)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, window.SN5_MXN(total))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      fontSize: 'var(--text-base)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      color: 'var(--text-body)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, "Facturado al cliente"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-primary)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, window.SN5_MXN(facturado)))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)',
      lineHeight: 'var(--lh-snug)'
    }
  }, "Considera el desfase: un proyecto puede facturarse al cliente en un mes distinto al que sus proveedores facturan."));
}
function DashboardScreen({
  onGo
}) {
  const d = window.SN5.dashboard;
  const [periodo, setPeriodo] = React.useState('mes');
  const [errFuente, setErrFuente] = React.useState(false);
  const kpiTarget = {
    cobrar: 'cuentas',
    pagar: 'cuentas',
    aprobadas: 'cotizaciones',
    borrador: 'cotizaciones'
  };
  const recientes = window.SN5.cotizaciones.slice(0, 6);
  const columns = [{
    key: 'folio',
    label: 'Folio',
    width: '90px',
    render: r => /*#__PURE__*/React.createElement(window.Folio, null, r.folio)
  }, {
    key: 'proyecto',
    label: 'Proyecto',
    width: '1.4fr',
    strong: true
  }, {
    key: 'cliente',
    label: 'Cliente',
    width: '1fr'
  }, {
    key: 'total',
    label: 'Total',
    width: '1fr',
    align: 'right',
    render: r => window.SN5_MXN(r.total)
  }, {
    key: 'estatus',
    label: 'Estatus',
    width: '120px',
    align: 'right',
    render: r => /*#__PURE__*/React.createElement(StatusBadge, {
      status: r.estatus
    })
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionHero, {
    title: "Inicio",
    action: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
        flexWrap: 'wrap',
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement(Select, {
      size: "md",
      value: periodo,
      onChange: e => setPeriodo(e.target.value),
      options: [{
        value: 'mes',
        label: 'Abril 2025'
      }, {
        value: 'trim',
        label: 'Q2 2025'
      }, {
        value: 'anio',
        label: 'Año 2025'
      }]
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "lg",
      iconLeft: "download"
    }, "Exportar balance"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, d.kpis.map(k => /*#__PURE__*/React.createElement(window.Metric, {
    key: k.id,
    label: k.label,
    nota: k.nota,
    accent: k.id === 'cobrar',
    value: k.moneda === false ? k.valor : window.SN5_MXN(k.valor),
    onClick: () => onGo(kpiTarget[k.id])
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: 'Balance por periodo · ' + d.periodo,
    eyebrow: "Miles de pesos",
    action: /*#__PURE__*/React.createElement(window.Legend, {
      series: window.SN5_SERIES
    })
  }, /*#__PURE__*/React.createElement(window.BarChart, {
    data: d.balance,
    series: window.SN5_SERIES,
    height: 186,
    onBarClick: () => onGo('cuentas'),
    format: v => '$ ' + v.toLocaleString('es-MX') + 'k'
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '15px 0 0',
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)'
    }
  }, "Da clic en cualquier mes para abrir Cuentas filtrado por ese periodo.")), /*#__PURE__*/React.createElement(window.Panel, {
    title: "Cruce del periodo"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, [{
    label: 'Ingresos',
    v: d.fiscal.ingresos,
    tone: 'var(--text-primary)'
  }, {
    label: 'Egresos',
    v: d.fiscal.egresos,
    tone: 'var(--text-body)'
  }, {
    label: 'Impuestos',
    v: d.fiscal.impuestos,
    tone: 'var(--text-body)'
  }, {
    label: 'Deudas',
    v: d.fiscal.deudas,
    tone: 'var(--accent)'
  }].map(r => /*#__PURE__*/React.createElement("div", {
    key: r.label
  }, /*#__PURE__*/React.createElement("div", {
    className: "sn-label",
    style: {
      marginBottom: 5
    }
  }, r.label), /*#__PURE__*/React.createElement("div", {
    className: "sn-display",
    style: {
      fontSize: 'var(--text-h3)',
      color: r.tone
    }
  }, window.SN5_MXN(r.v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 'var(--space-md)',
      borderTop: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sn-label",
    style: {
      marginBottom: 5
    }
  }, "Utilidad antes de ISR"), /*#__PURE__*/React.createElement("div", {
    className: "sn-display",
    style: {
      fontSize: 'var(--text-h2)',
      color: 'var(--sn-status-approved-fg)'
    }
  }, window.SN5_MXN(d.fiscal.ingresos - d.fiscal.egresos - d.fiscal.impuestos)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, "ISR 30% sobre utilidad \xB7 persona moral"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "Gastos fijos vs. facturaci\xF3n",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "md",
      onClick: () => onGo('cuentas'),
      iconRight: "arrow-right"
    }, "Cuentas")
  }, /*#__PURE__*/React.createElement(CoberturaMes, {
    gastos: d.gastosFijos,
    facturado: d.facturadoMes
  })), /*#__PURE__*/React.createElement(window.Panel, {
    title: "Actividad del periodo"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, d.actividad.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.label,
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-base)',
      color: 'var(--text-muted)'
    }
  }, a.label), /*#__PURE__*/React.createElement("span", {
    className: "sn-display",
    style: {
      fontSize: 'var(--text-h3)',
      color: 'var(--text-primary)'
    }
  }, a.valor))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)',
      lineHeight: 'var(--lh-snug)'
    }
  }, "Los proyectos que cruzan de un mes a otro se cuentan aparte para no perderlos en el corte mensual."))), /*#__PURE__*/React.createElement(window.Panel, {
    title: "Cotizaciones recientes",
    padding: "0",
    action: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 'var(--space-md)',
        flexWrap: 'wrap',
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "md",
      onClick: () => setErrFuente(!errFuente)
    }, errFuente ? 'Restaurar fuente' : 'Simular error'), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "md",
      onClick: () => onGo('cotizaciones'),
      iconRight: "arrow-right"
    }, "Ver todas"))
  }, errFuente ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(FuenteError, {
    nombre: "Cotizaciones",
    onRetry: () => setErrFuente(false)
  })) : /*#__PURE__*/React.createElement(DataTable, {
    columns: columns,
    rows: recientes,
    minWidth: 620,
    onRowClick: () => onGo('cotizaciones')
  }))));
}
Object.assign(window, {
  DashboardScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/DashboardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/LoginScreen.jsx
try { (() => {
/* 11 · Login — tarjeta centrada, sin registro público. La textura de marca
   aparece detrás del wordmark, que es uno de los usos que el brief describe
   ("wordmark blanco sobre textura degradada"). */
const {
  Card,
  Button,
  Icon,
  Wordmark,
  TextField
} = window.SerenataDesignSystem_993393;
function LoginScreen({
  onEnter
}) {
  const [correo, setCorreo] = React.useState('carla@serenata.mx');
  const [pass, setPass] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const submit = () => {
    if (!pass) {
      setError('Credenciales incorrectas. Verifica tu correo y contraseña.');
      return;
    }
    setError('');
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onEnter && onEnter();
    }, 700);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-2xl)',
      background: 'var(--sn-texture)',
      backgroundSize: 'cover',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(180deg,rgba(15,19,24,.88) 0%,rgba(15,19,24,.94) 100%)',
      backdropFilter: 'blur(64px)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%',
      maxWidth: 392,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xl)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    variant: "wordmark",
    tone: "white",
    size: 27
  }), /*#__PURE__*/React.createElement("div", {
    className: "sn-eyebrow"
  }, "ERP de producci\xF3n")), /*#__PURE__*/React.createElement(Card, {
    padding: "var(--space-xl)",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    label: "Correo",
    value: correo,
    onChange: e => setCorreo(e.target.value),
    placeholder: "tu@serenata.mx"
  }), /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sn-label"
  }, "Contrase\xF1a"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    value: pass,
    onChange: e => setPass(e.target.value),
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    onKeyDown: e => e.key === 'Enter' && submit(),
    style: {
      height: 'var(--control-height)',
      padding: '0 14px',
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      outline: 'none',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  })), error ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
      padding: '11px 13px',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--sn-status-cancelled-bg)',
      color: 'var(--sn-status-cancelled-fg)',
      fontSize: 'var(--text-md)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert-triangle",
    size: 15
  }), /*#__PURE__*/React.createElement("span", null, error)) : null, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    fullWidth: true,
    onClick: submit,
    disabled: loading,
    iconLeft: loading ? 'loader' : undefined
  }, loading ? 'Entrando…' : 'Entrar')), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      textAlign: 'center',
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)'
    }
  }, "Las cuentas se crean desde Admin \xB7 Usuarios.")));
}
Object.assign(window, {
  LoginScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/LoginScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/PlaneacionScreen.jsx
try { (() => {
/* 7 · Planeación. Wizard de 4 pasos que convierte mensajes informales de email
   o WhatsApp en cotizaciones usando IA para extraer los datos. Fase 5 no
   cambia el fondo de esta pantalla. El descarte de un evento pendiente es
   soft-delete: no se borra, se marca como eliminado y deja de listarse. */
const {
  Button,
  Card,
  Icon,
  Select,
  TextField,
  SearchInput,
  DataTable,
  SectionHero
} = window.SerenataDesignSystem_993393;
const SN5_PASOS = ['Proyecto', 'Mensaje', 'Validación', 'Confirmación'];
function Pasos({
  paso
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      flexWrap: 'wrap'
    }
  }, SN5_PASOS.map((label, i) => {
    const n = i + 1;
    const hecho = n < paso;
    const activo = n === paso;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: label
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 26,
        height: 26,
        flex: 'none',
        borderRadius: 'var(--radius-circle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: activo ? 'var(--accent)' : hecho ? 'var(--sn-status-approved-bg)' : 'var(--surface-input)',
        border: '1px solid ' + (activo || hecho ? 'transparent' : 'var(--border-subtle)'),
        color: activo ? 'var(--sn-orange-ink)' : hecho ? 'var(--sn-status-approved-fg)' : 'var(--text-faint)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-bold)',
        transition: 'var(--transition-control)'
      }
    }, hecho ? /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 13,
      strokeWidth: 3
    }) : n), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-md)',
        fontWeight: activo ? 'var(--weight-semibold)' : 'var(--weight-medium)',
        color: activo ? 'var(--text-primary)' : 'var(--text-muted)',
        whiteSpace: 'nowrap'
      }
    }, label)), n < SN5_PASOS.length ? /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 16,
        height: 1,
        background: 'var(--border-subtle)'
      }
    }) : null);
  }));
}
function Pendientes({
  pendientes,
  onDescartar,
  onProcesar,
  onBack
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "md",
    iconLeft: "arrow-left",
    onClick: onBack
  }, "Planeaci\xF3n"), /*#__PURE__*/React.createElement("h1", {
    className: "sn-display",
    style: {
      margin: 0,
      fontSize: 'var(--text-h2)'
    }
  }, "Eventos pendientes")), /*#__PURE__*/React.createElement(window.Panel, {
    title: "Sin completar",
    padding: "0",
    action: /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-md)',
        color: 'var(--text-faint)'
      }
    }, "Descartar no borra el registro, s\xF3lo lo saca de la lista")
  }, pendientes.length ? pendientes.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: '15px var(--space-lg)',
      borderBottom: i === pendientes.length - 1 ? 0 : '1px solid var(--border-subtle)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(window.Folio, {
    size: 12,
    color: "var(--text-faint)"
  }, p.id), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 180,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-primary)',
      fontWeight: 'var(--weight-medium)'
    }
  }, p.asunto), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-faint)',
      marginTop: 2
    }
  }, p.origen, " \xB7 recibido ", p.recibido)), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 'var(--text-md)',
      color: 'var(--sn-status-cancelled-fg)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert-triangle",
    size: 14
  }), p.falta), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "md",
    onClick: onProcesar
  }, "Procesar"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "md",
    onClick: () => onDescartar(p.id)
  }, "Descartar"))) : /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-3xl)',
      textAlign: 'center',
      color: 'var(--text-muted)'
    }
  }, "No queda ning\xFAn evento pendiente.")));
}
function PlaneacionScreen() {
  const p = window.SN5.planeacion;
  const [vista, setVista] = React.useState('wizard');
  const [pendientes, setPendientes] = React.useState(p.pendientes);
  const [paso, setPaso] = React.useState(1);
  const [modo, setModo] = React.useState('nuevo');
  const [proyecto, setProyecto] = React.useState('');
  const [mensaje, setMensaje] = React.useState('');
  const [analizando, setAnalizando] = React.useState(false);
  const [eventos, setEventos] = React.useState([]);
  const [toast, setToast] = React.useState(null);
  const analizar = () => {
    setAnalizando(true);
    setTimeout(() => {
      setEventos(p.extraidos.map(e => ({
        ...e
      })));
      setAnalizando(false);
      setPaso(3);
    }, 900);
  };
  const setEv = (i, k, v) => setEventos(es => es.map((e, j) => j === i ? {
    ...e,
    [k]: v
  } : e));
  if (vista === 'pendientes') {
    return /*#__PURE__*/React.createElement(Pendientes, {
      pendientes: pendientes,
      onBack: () => setVista('wizard'),
      onDescartar: id => setPendientes(pendientes.filter(x => x.id !== id)),
      onProcesar: () => {
        setVista('wizard');
        setPaso(2);
        setMensaje(p.mensaje);
      }
    });
  }
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionHero, {
    title: "Planeaci\xF3n",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "lg",
      iconRight: "arrow-right",
      onClick: () => setVista('pendientes')
    }, "Eventos pendientes \xB7 ", pendientes.length)
  }), pendientes.length ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setVista('pendientes'),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      width: '100%',
      padding: '13px var(--space-lg)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--surface-row)',
      border: '1px solid var(--border-subtle)',
      cursor: 'pointer',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "inbox",
    size: 16,
    color: "var(--accent)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }, "Tienes ", pendientes.length, " eventos sin completar o confirmar."), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-muted)"
  })) : null, /*#__PURE__*/React.createElement(window.Panel, {
    title: "Convertir un mensaje en cotizaci\xF3n",
    action: /*#__PURE__*/React.createElement(Pasos, {
      paso: paso
    }),
    bodyStyle: {
      paddingTop: 'var(--space-xl)'
    }
  }, paso === 1 ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)',
      maxWidth: 520
    }
  }, /*#__PURE__*/React.createElement(window.Field, {
    label: "\xBFEs un proyecto que ya existe?"
  }, /*#__PURE__*/React.createElement(Select, {
    size: "md",
    value: modo,
    onChange: e => setModo(e.target.value),
    style: {
      width: '100%'
    },
    options: [{
      value: 'nuevo',
      label: 'Es un proyecto nuevo'
    }, {
      value: 'existente',
      label: 'Ya existe en el sistema'
    }]
  })), modo === 'existente' ? /*#__PURE__*/React.createElement(window.Field, {
    label: "Proyecto"
  }, /*#__PURE__*/React.createElement(Select, {
    size: "md",
    value: proyecto,
    onChange: e => setProyecto(e.target.value),
    style: {
      width: '100%'
    },
    options: [{
      value: '',
      label: 'Selecciona un proyecto…'
    }, ...window.SN5.proyectos.map(x => ({
      value: x.folio,
      label: x.folio + ' · ' + x.nombre
    }))]
  })) : /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)',
      lineHeight: 'var(--lh-snug)'
    }
  }, "La IA propondr\xE1 el nombre del proyecto a partir del mensaje. Podr\xE1s corregirlo en el paso de validaci\xF3n."), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    style: {
      alignSelf: 'flex-start'
    },
    onClick: () => setPaso(2)
  }, "Continuar")) : null, paso === 2 ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(window.Field, {
    label: "Pega aqu\xED el mensaje de email o WhatsApp"
  }, /*#__PURE__*/React.createElement("textarea", {
    value: mensaje,
    onChange: e => setMensaje(e.target.value),
    rows: 7,
    placeholder: "Pega el texto tal como lo recibiste. No hace falta limpiarlo.",
    style: {
      width: '100%',
      padding: '13px 15px',
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-input)',
      outline: 'none',
      resize: 'vertical',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)',
      lineHeight: 'var(--lh-body)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-md)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg",
    onClick: () => setPaso(1)
  }, "Atr\xE1s"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    onClick: () => setMensaje(p.mensaje)
  }, "Usar mensaje de ejemplo"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 12
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconLeft: analizando ? 'loader' : 'sparkles',
    disabled: !mensaje.trim() || analizando,
    onClick: analizar
  }, analizando ? 'Extrayendo datos…' : 'Extraer datos'))) : null, paso === 3 ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-base)',
      color: 'var(--text-muted)'
    }
  }, "Revisa y corrige lo que extrajo la IA antes de continuar."), eventos.map((e, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    padding: "var(--space-lg)",
    tone: "row",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    label: "Proyecto",
    value: e.proyecto,
    onChange: v => setEv(i, 'proyecto', v.target.value)
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "Cliente",
    value: e.cliente,
    onChange: v => setEv(i, 'cliente', v.target.value)
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "Fecha de inicio",
    value: e.fecha,
    onChange: v => setEv(i, 'fecha', v.target.value)
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "Fecha de fin",
    value: e.fin,
    onChange: v => setEv(i, 'fin', v.target.value)
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "Locaci\xF3n",
    value: e.locacion,
    onChange: v => setEv(i, 'locacion', v.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 11,
      padding: 'var(--space-md) var(--space-lg)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 15,
    color: "var(--accent)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sn-eyebrow",
    style: {
      marginBottom: 4
    }
  }, "Nota de la IA"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)',
      lineHeight: 'var(--lh-snug)'
    }
  }, e.notaIA))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg",
    onClick: () => setPaso(2)
  }, "Atr\xE1s"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    onClick: () => setPaso(4)
  }, "Continuar"))) : null, paso === 4 ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    tone: "row"
  }, /*#__PURE__*/React.createElement(DataTable, {
    minWidth: 0,
    columns: [{
      key: 'proyecto',
      label: 'Proyecto',
      width: '1.4fr',
      strong: true
    }, {
      key: 'cliente',
      label: 'Cliente',
      width: '1fr'
    }, {
      key: 'fecha',
      label: 'Evento',
      width: '1.2fr',
      render: e => e.fecha + ' — ' + e.fin
    }, {
      key: 'locacion',
      label: 'Locación',
      width: '1.4fr'
    }],
    rows: eventos
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)',
      lineHeight: 'var(--lh-snug)'
    }
  }, "Se crear\xE1 ", eventos.length === 1 ? 'una cotización en borrador' : eventos.length + ' cotizaciones en borrador', " con estos datos. Las partidas se capturan despu\xE9s, en el Cotizador."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg",
    onClick: () => setPaso(3)
  }, "Atr\xE1s"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconLeft: "check",
    onClick: () => {
      setToast({
        msg: 'Se creó la cotización SH016 en borrador.',
        link: 'Abrir SH016'
      });
      setPaso(1);
      setMensaje('');
      setEventos([]);
    }
  }, "Convertir en cotizaci\xF3n"))) : null), /*#__PURE__*/React.createElement(window.Toast, {
    onClose: () => setToast(null),
    link: toast && toast.link
  }, toast && toast.msg));
}
Object.assign(window, {
  PlaneacionScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/PlaneacionScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/PlantillasScreen.jsx
try { (() => {
/* 8 · Plantillas de Servicios. Grilla con preview de los primeros items y un
   editor con la misma tabla editable que usan las partidas de una cotización.
   Fase 5 no cambia el fondo de esta pantalla.

   Pendiente confirmar con el dueño del producto: hoy la integración de
   plantillas con cotizaciones complementarias es parcial. */
const {
  Button,
  Card,
  Icon,
  Select,
  SearchInput,
  TextField,
  SectionHero
} = window.SerenataDesignSystem_993393;
const SN5_GRID_ITEMS = '112px minmax(0,1.7fr) 62px 118px minmax(0,1fr) 118px 34px';
function ItemsEditor({
  items,
  onChange
}) {
  const II = window.InlineInput;
  const set = (i, k, v) => onChange(items.map((p, j) => j === i ? {
    ...p,
    [k]: v
  } : p));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 880
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: SN5_GRID_ITEMS,
      gap: 'var(--space-md)',
      padding: '13px 0',
      borderBottom: '1px solid var(--border-subtle)',
      fontSize: 'var(--text-table-head)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--tracking-label)',
      textTransform: 'uppercase',
      color: 'var(--text-faint)'
    }
  }, /*#__PURE__*/React.createElement("div", null, "Categor\xEDa"), /*#__PURE__*/React.createElement("div", null, "Descripci\xF3n"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, "Cant."), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, "P. unitario"), /*#__PURE__*/React.createElement("div", null, "Responsable"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, "X pagar"), /*#__PURE__*/React.createElement("div", null)), items.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'grid',
      gridTemplateColumns: SN5_GRID_ITEMS,
      gap: 'var(--space-md)',
      alignItems: 'center',
      padding: '7px 0',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Select, {
    size: "sm",
    value: p.categoria,
    onChange: e => set(i, 'categoria', e.target.value),
    options: window.SN5_CATEGORIAS,
    style: {
      width: '100%'
    }
  }), /*#__PURE__*/React.createElement(II, {
    value: p.descripcion,
    onChange: v => set(i, 'descripcion', v),
    suggestions: window.SN5_CATALOGO,
    placeholder: "Buscar en cat\xE1logo\u2026"
  }), /*#__PURE__*/React.createElement(II, {
    value: p.cantidad,
    onChange: v => set(i, 'cantidad', v),
    align: "right"
  }), /*#__PURE__*/React.createElement(II, {
    value: p.precio,
    onChange: v => set(i, 'precio', v),
    align: "right"
  }), /*#__PURE__*/React.createElement(II, {
    value: p.responsable,
    onChange: v => set(i, 'responsable', v),
    suggestions: window.SN5_RESPONSABLES,
    placeholder: "Asignar\u2026"
  }), /*#__PURE__*/React.createElement(II, {
    value: p.xPagar,
    onChange: v => set(i, 'xPagar', v),
    align: "right"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => onChange(items.filter((_, j) => j !== i)),
    "aria-label": "Quitar item",
    style: {
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      color: 'var(--text-faint)',
      padding: 5
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash-2",
    size: 15
  })))))));
}
function PlantillaEditor({
  t,
  onClose,
  nueva
}) {
  const [nombre, setNombre] = React.useState(t ? t.nombre : '');
  const [descripcion, setDescripcion] = React.useState(t ? t.descripcion : '');
  const [items, setItems] = React.useState(t ? t.items.map(x => ({
    ...x
  })) : []);
  const [error, setError] = React.useState('');
  const subtotal = items.reduce((a, x) => a + (parseFloat(x.cantidad) || 0) * (parseFloat(x.precio) || 0), 0);
  const guardar = () => {
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    onClose();
  };
  return /*#__PURE__*/React.createElement(window.Modal, {
    title: nueva ? 'Nueva plantilla' : nombre,
    eyebrow: "Plantillas de servicios",
    width: 1000,
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "sn-label"
    }, "Subtotal de la plantilla"), /*#__PURE__*/React.createElement("div", {
      className: "sn-display",
      style: {
        fontSize: 'var(--text-h3)'
      }
    }, window.SN5_MXN(subtotal))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "lg",
      onClick: onClose
    }, "Cancelar"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      onClick: guardar
    }, "Guardar"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xl)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    label: "Nombre \xB7 requerido",
    value: nombre,
    onChange: e => {
      setNombre(e.target.value);
      setError('');
    },
    placeholder: "Ej. Rodaje 2 d\xEDas \xB7 foro",
    hint: error
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "Descripci\xF3n \xB7 opcional",
    value: descripcion,
    onChange: e => setDescripcion(e.target.value),
    placeholder: "Cu\xE1ndo conviene usar esta plantilla"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sn-label",
    style: {
      marginBottom: 'var(--space-sm)'
    }
  }, "Items"), /*#__PURE__*/React.createElement(ItemsEditor, {
    items: items,
    onChange: setItems
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "md",
    iconLeft: "plus",
    style: {
      marginTop: 'var(--space-md)'
    },
    onClick: () => setItems([...items, {
      categoria: 'Producción',
      descripcion: '',
      cantidad: 1,
      precio: 0,
      responsable: '',
      xPagar: 0
    }])
  }, "Agregar item"))));
}
function PlantillasScreen() {
  const [plantillas, setPlantillas] = React.useState(window.SN5.plantillas);
  const [q, setQ] = React.useState('');
  const [editar, setEditar] = React.useState(null);
  const [nueva, setNueva] = React.useState(false);
  const [borrar, setBorrar] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const rows = plantillas.filter(t => !q.trim() || t.nombre.toLowerCase().includes(q.trim().toLowerCase()));
  const duplicar = t => {
    setPlantillas([...plantillas, {
      ...t,
      nombre: t.nombre + ' (copia)'
    }]);
    setToast({
      msg: 'Se duplicó "' + t.nombre + '".'
    });
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionHero, {
    title: "Plantillas",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      iconLeft: "plus",
      onClick: () => setNueva(true)
    }, "Nueva plantilla")
  }), /*#__PURE__*/React.createElement(SearchInput, {
    size: "lg",
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Buscar por nombre\u2026",
    style: {
      alignSelf: 'flex-start',
      width: '100%',
      maxWidth: 420
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, rows.map((t, idx) => /*#__PURE__*/React.createElement(Card, {
    key: t.nombre + idx,
    padding: "0",
    style: {
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-lg)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-h3)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-primary)',
      lineHeight: 'var(--lh-snug)'
    }
  }, t.nombre), t.descripcion ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '7px 0 0',
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)',
      lineHeight: 'var(--lh-snug)'
    }
  }, t.descripcion) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: 'var(--space-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 11
    }
  }, t.items.slice(0, 3).map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'var(--space-md)',
      fontSize: 'var(--text-base)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      color: 'var(--text-body)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, it.descripcion), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)',
      flex: 'none'
    }
  }, window.SN5_MXN(it.precio)))), t.items.length > 3 ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)'
    }
  }, "+", t.items.length - 3, " m\xE1s") : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: 'var(--space-md) var(--space-lg)',
      borderTop: '1px solid var(--border-subtle)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "md",
    onClick: () => setEditar(t)
  }, "Editar"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "md",
    iconLeft: "copy",
    onClick: () => duplicar(t)
  }, "Duplicar"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 8
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setBorrar(t),
    "aria-label": 'Eliminar ' + t.nombre,
    style: {
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      color: 'var(--text-faint)',
      padding: 6,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash-2",
    size: 16
  })))))), editar ? /*#__PURE__*/React.createElement(PlantillaEditor, {
    t: editar,
    onClose: () => setEditar(null)
  }) : null, nueva ? /*#__PURE__*/React.createElement(PlantillaEditor, {
    nueva: true,
    onClose: () => setNueva(false)
  }) : null, borrar ? /*#__PURE__*/React.createElement(window.Modal, {
    title: "Eliminar plantilla",
    eyebrow: borrar.nombre,
    width: 480,
    onClose: () => setBorrar(null),
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "lg",
      onClick: () => setBorrar(null)
    }, "Mantener"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      onClick: () => {
        setPlantillas(plantillas.filter(x => x !== borrar));
        setBorrar(null);
        setToast({
          msg: 'Plantilla eliminada.'
        });
      }
    }, "S\xED, eliminar"))
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)',
      lineHeight: 'var(--lh-body)'
    }
  }, "Se eliminan los ", borrar.items.length, " items de esta plantilla. Las cotizaciones que ya la usaron conservan sus partidas.")) : null, /*#__PURE__*/React.createElement(window.Toast, {
    onClose: () => setToast(null)
  }, toast && toast.msg));
}
Object.assign(window, {
  PlantillasScreen,
  ItemsEditor
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/PlantillasScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/PortalScreen.jsx
try { (() => {
/* 4 · Portal de Colaboradores (Fase 5.5). Autoservicio: el colaborador captura
   sus propios datos, sube documentación legal/fiscal y sube facturas con
   validación automática visible al momento contra su cuenta por pagar. */
const {
  Button,
  Card,
  Icon,
  Avatar,
  Select,
  TextField,
  FilterTabs,
  DataTable,
  SectionHero
} = window.SerenataDesignSystem_993393;
function DropZone({
  label,
  hint,
  onDrop
}) {
  const [over, setOver] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onDrop,
    onDragOver: e => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: e => {
      e.preventDefault();
      setOver(false);
      onDrop && onDrop();
    },
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      padding: 'var(--space-xl)',
      cursor: 'pointer',
      borderRadius: 'var(--radius-lg)',
      border: '1px dashed ' + (over ? 'var(--accent)' : 'var(--border-subtle)'),
      background: over ? 'var(--surface-row-alt)' : 'var(--surface-input)',
      transition: 'var(--transition-control)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "upload",
    size: 20,
    color: over ? 'var(--accent)' : 'var(--text-muted)'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)',
      fontWeight: 'var(--weight-medium)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)',
      textAlign: 'center'
    }
  }, hint));
}
function ValidacionFactura({
  resultado,
  onClose
}) {
  const ok = resultado.every(r => r.ok);
  return /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    style: {
      borderColor: ok ? 'var(--sn-status-approved-bg)' : 'var(--sn-status-cancelled-bg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: '13px var(--space-lg)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ok ? 'check-circle' : 'alert-triangle',
    size: 18,
    color: ok ? 'var(--sn-status-approved-fg)' : 'var(--sn-status-cancelled-fg)'
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-lg)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-primary)'
    }
  }, ok ? 'Factura aceptada' : 'La factura necesita corrección'), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "md",
    onClick: onClose
  }, "Subir otra")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, resultado.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: r.label,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-md)',
      padding: '13px var(--space-lg)',
      borderBottom: i === resultado.length - 1 ? 0 : '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: r.ok ? 'check' : 'x',
    size: 15,
    color: r.ok ? 'var(--sn-status-approved-fg)' : 'var(--sn-status-cancelled-fg)',
    strokeWidth: 2.5
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }, r.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)',
      marginTop: 2
    }
  }, r.detalle))))));
}
function PortalScreen() {
  const c = window.SN5.colaborador;
  const [tab, setTab] = React.useState('datos');
  const [regimen, setRegimen] = React.useState(c.regimen);
  const [roles, setRoles] = React.useState(c.roles);
  const [nuevoRol, setNuevoRol] = React.useState('');
  const [validacion, setValidacion] = React.useState(null);
  const cuenta = window.SN5.cuentasPagar.find(x => x.responsable === 'Ana Vidal') || window.SN5.cuentasPagar[1];
  const f = window.sn5Fiscal(cuenta.total, regimen);
  const validar = () => setValidacion([{
    ok: true,
    label: 'La factura está bien elaborada',
    detalle: 'CFDI 4.0 válido · RFC receptor coincide con Serenata House Entertainment'
  }, {
    ok: true,
    label: 'El monto coincide con lo esperado',
    detalle: 'Cuenta ' + cuenta.folio + ' · neto esperado ' + window.SN5_MXN(cuenta.total)
  }, {
    ok: true,
    label: 'El impuesto corresponde a tu régimen',
    detalle: regimen === 'moral' ? 'Persona moral · IVA 16% acreditable, sin retenciones. Total a transferir ' + window.SN5_MXN(f.pago) : 'Persona física con honorarios · IVA 16%, retención de IVA 2/3 (10.6667%) y retención de ISR 10% sobre el subtotal. Total a transferir ' + window.SN5_MXN(f.pago)
  }]);
  const facturaCols = [{
    key: 'id',
    label: 'Factura',
    width: '110px',
    render: r => /*#__PURE__*/React.createElement(window.Folio, null, r.id)
  }, {
    key: 'proyecto',
    label: 'Proyecto',
    width: '1.5fr',
    strong: true
  }, {
    key: 'cuenta',
    label: 'Cuenta',
    width: '100px',
    render: r => /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-muted)'
      }
    }, r.cuenta)
  }, {
    key: 'monto',
    label: 'Monto',
    width: '1fr',
    align: 'right',
    render: r => window.SN5_MXN(r.monto)
  }, {
    key: 'fecha',
    label: 'Enviada',
    width: '1fr'
  }, {
    key: 'estado',
    label: 'Validación',
    width: '140px',
    align: 'right',
    render: r => /*#__PURE__*/React.createElement(window.SNBadge, {
      state: r.estado
    })
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionHero, {
    title: "Portal",
    action: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)'
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      initials: c.initials,
      size: 38
    }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-lg)',
        fontWeight: 'var(--weight-semibold)',
        color: 'var(--text-primary)'
      }
    }, c.nombre), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-md)',
        color: 'var(--text-muted)'
      }
    }, "Colaboradora externa")))
  }), /*#__PURE__*/React.createElement(FilterTabs, {
    tabs: [{
      id: 'datos',
      label: 'Mis datos'
    }, {
      id: 'docs',
      label: 'Documentación'
    }, {
      id: 'factura',
      label: 'Subir factura'
    }, {
      id: 'historial',
      label: 'Historial',
      count: c.facturas.length
    }],
    value: tab,
    onChange: setTab,
    style: {
      alignSelf: 'flex-start'
    }
  }), tab === 'datos' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))',
      gap: 'var(--space-lg)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "Datos personales"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    label: "Nombre completo",
    defaultValue: c.nombre
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "Tel\xE9fono",
    defaultValue: c.telefono
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "Correo",
    defaultValue: c.correo
  }))), /*#__PURE__*/React.createElement(window.Panel, {
    title: "Roles"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 9,
      flexWrap: 'wrap'
    }
  }, roles.map(r => /*#__PURE__*/React.createElement("span", {
    key: r,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      padding: '6px 8px 6px 13px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-row-alt)',
      border: '1px solid var(--border-subtle)',
      fontSize: 'var(--text-md)',
      color: 'var(--text-body)'
    }
  }, r, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setRoles(roles.filter(x => x !== r)),
    "aria-label": 'Quitar ' + r,
    style: {
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      color: 'var(--text-faint)',
      padding: 0,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 13
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-md)',
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    label: "Agregar rol",
    value: nuevoRol,
    onChange: e => setNuevoRol(e.target.value),
    placeholder: "Ej. Directora de Fotograf\xEDa"
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "md",
    onClick: () => {
      if (nuevoRol.trim()) {
        setRoles([...roles, nuevoRol.trim()]);
        setNuevoRol('');
      }
    }
  }, "Agregar")))), /*#__PURE__*/React.createElement(window.Panel, {
    title: "Datos bancarios y fiscales"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    label: "Banco",
    defaultValue: c.banco
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "CLABE \xB7 18 d\xEDgitos",
    defaultValue: c.clabe
  }), /*#__PURE__*/React.createElement(window.Field, {
    label: "R\xE9gimen fiscal"
  }, /*#__PURE__*/React.createElement(Select, {
    size: "md",
    value: regimen,
    onChange: e => setRegimen(e.target.value),
    style: {
      width: '100%'
    },
    options: [{
      value: 'moral',
      label: 'Persona moral · IVA 16%'
    }, {
      value: 'fisica',
      label: 'Persona física con honorarios'
    }]
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)',
      lineHeight: 'var(--lh-snug)'
    }
  }, regimen === 'moral' ? 'Facturas con IVA 16% acreditable, sin retenciones.' : 'Se te retiene IVA de 2/3 (10.6667%) e ISR de 10%, ambas sobre el subtotal.'), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg"
  }, "Guardar cambios")))) : null, tab === 'docs' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))',
      gap: 'var(--space-lg)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "Subir documentaci\xF3n"
  }, /*#__PURE__*/React.createElement(DropZone, {
    label: "Arrastra tus documentos aqu\xED",
    hint: "Constancia de situaci\xF3n fiscal, INE, contratos. PDF o imagen."
  })), /*#__PURE__*/React.createElement(window.Panel, {
    title: "Mis documentos",
    padding: "0"
  }, c.documentos.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: d.nombre,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: '15px var(--space-lg)',
      borderBottom: i === c.documentos.length - 1 ? 0 : '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-text",
    size: 16,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }, d.nombre), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-faint)',
      marginTop: 2
    }
  }, d.fecha)), /*#__PURE__*/React.createElement(window.SNBadge, {
    state: d.estado
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "md",
    iconLeft: d.estado === 'pendiente' ? 'upload' : 'download'
  }, d.estado === 'pendiente' ? 'Subir' : 'Ver'))))) : null, tab === 'factura' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))',
      gap: 'var(--space-lg)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "Subir factura"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(window.Field, {
    label: "Cuenta a la que corresponde"
  }, /*#__PURE__*/React.createElement(Select, {
    size: "md",
    style: {
      width: '100%'
    },
    options: window.SN5.cuentasPagar.filter(x => x.responsable === 'Ana Vidal' || x.estado !== 'PAGADO').map(x => ({
      value: x.folio + x.descripcion,
      label: x.folio + ' · ' + x.descripcion + ' · ' + window.SN5_MXN(x.total)
    }))
  })), /*#__PURE__*/React.createElement(DropZone, {
    label: "Arrastra el XML y el PDF",
    hint: "Se validan al momento contra el monto de la cuenta y tu r\xE9gimen fiscal.",
    onDrop: validar
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconLeft: "check",
    onClick: validar
  }, "Validar factura"))), validacion ? /*#__PURE__*/React.createElement(ValidacionFactura, {
    resultado: validacion,
    onClose: () => setValidacion(null)
  }) : /*#__PURE__*/React.createElement(window.Panel, {
    title: "Qu\xE9 se revisa"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, [['Elaboración', 'CFDI 4.0 válido, RFC receptor correcto, concepto legible.'], ['Monto', 'Debe coincidir con el neto de la cuenta por pagar, sin tus impuestos encima.'], ['Impuestos', 'IVA y retenciones según tu régimen fiscal registrado.']].map(([t, d]) => /*#__PURE__*/React.createElement("div", {
    key: t
  }, /*#__PURE__*/React.createElement("div", {
    className: "sn-label",
    style: {
      marginBottom: 5
    }
  }, t), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-base)',
      color: 'var(--text-muted)',
      lineHeight: 'var(--lh-body)'
    }
  }, d)))))) : null, tab === 'historial' ? /*#__PURE__*/React.createElement(Card, {
    padding: "0"
  }, /*#__PURE__*/React.createElement(DataTable, {
    columns: facturaCols,
    rows: c.facturas,
    emptyLabel: "Todav\xEDa no has subido facturas"
  })) : null);
}
Object.assign(window, {
  PortalScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/PortalScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/ProyectosScreen.jsx
try { (() => {
/* 2 · Proyectos (Fase 5.2). Tablero / Lista / Calendario sobre los mismos
   datos, y un panel de detalle que conserva todos los campos actuales y agrega
   plantillas auto-llenables, documentos, reporte de cierre y el asistente
   sobre historial de proyectos. */
const {
  Button,
  Card,
  Icon,
  Avatar,
  Select,
  SearchInput,
  FilterButton,
  DataTable,
  TableFooter,
  FilterTabs,
  SectionHero
} = window.SerenataDesignSystem_993393;
function ProyectoCard({
  p,
  onOpen
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement(Card, {
    onClick: () => onOpen(p),
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    padding: "var(--space-md)",
    radius: "var(--radius-lg)",
    style: {
      cursor: 'pointer',
      background: hover ? 'var(--surface-row-alt)' : 'var(--surface-row)',
      transition: 'var(--transition-control)',
      display: 'flex',
      flexDirection: 'column',
      gap: 11
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement(window.Folio, {
    size: 12,
    color: "var(--text-faint)"
  }, p.folio), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, p.entrega)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-lg)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-primary)',
      lineHeight: 'var(--lh-snug)'
    }
  }, p.nombre), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, p.cliente), /*#__PURE__*/React.createElement(window.ProgressBar, {
    value: p.progreso
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex'
    }
  }, p.equipo.map((e, i) => /*#__PURE__*/React.createElement(Avatar, {
    key: e,
    initials: e,
    size: 24,
    style: {
      marginLeft: i ? -7 : 0,
      border: '2px solid var(--surface-row)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-faint)'
    }
  }, p.progreso, "%")));
}
function Tablero({
  proyectos,
  onOpen
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
      gap: 'var(--space-lg)',
      alignItems: 'start'
    }
  }, window.SN5.estadosProyecto.map(estado => {
    const col = proyectos.filter(p => p.estado === estado);
    return /*#__PURE__*/React.createElement("div", {
      key: estado,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 4px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "sn-label"
    }, estado), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-xs)',
        color: 'var(--text-faint)'
      }
    }, col.length), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: 1,
        background: 'var(--border-subtle)'
      }
    })), col.map(p => /*#__PURE__*/React.createElement(ProyectoCard, {
      key: p.folio,
      p: p,
      onOpen: onOpen
    })), !col.length ? /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 'var(--space-lg)',
        textAlign: 'center',
        fontSize: 'var(--text-md)',
        color: 'var(--text-faint)',
        border: '1px dashed var(--border-subtle)',
        borderRadius: 'var(--radius-lg)'
      }
    }, "Sin proyectos") : null);
  }));
}
function Calendario({
  proyectos,
  onOpen
}) {
  const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const start = 1; /* 01 abr 2025 cae en martes: un hueco al inicio */
  const cells = Array.from({
    length: 35
  }, (_, i) => i - start + 1);
  const porDia = {};
  proyectos.forEach(p => {
    const d = parseInt(p.entrega.slice(0, 2), 10);
    porDia[d] = porDia[d] || [];
    porDia[d].push(p);
  });
  return /*#__PURE__*/React.createElement(Card, {
    padding: "0"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, minmax(0,1fr))',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, dias.map(d => /*#__PURE__*/React.createElement("div", {
    key: d,
    className: "sn-label",
    style: {
      padding: '13px var(--space-md)'
    }
  }, d))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, minmax(0,1fr))'
    }
  }, cells.map((n, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      minHeight: 108,
      padding: 'var(--space-md)',
      borderRight: i % 7 === 6 ? 0 : '1px solid var(--border-subtle)',
      borderBottom: i < 28 ? '1px solid var(--border-subtle)' : 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      color: n >= 1 && n <= 30 ? 'var(--text-muted)' : 'var(--text-faint)',
      opacity: n >= 1 && n <= 30 ? 1 : 0.35
    }
  }, n >= 1 && n <= 30 ? String(n).padStart(2, '0') : ''), (porDia[n] || []).map(p => /*#__PURE__*/React.createElement("button", {
    key: p.folio,
    type: "button",
    onClick: () => onOpen(p),
    style: {
      textAlign: 'left',
      padding: '7px 9px',
      borderRadius: 'var(--radius-sm)',
      border: 0,
      cursor: 'pointer',
      background: p.estado === 'FINALIZADO' ? 'var(--surface-row-alt)' : 'var(--accent)',
      color: p.estado === 'FINALIZADO' ? 'var(--text-body)' : 'var(--sn-orange-ink)',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--weight-semibold)',
      lineHeight: 1.3
    }
  }, p.folio, " \xB7 ", p.nombre))))));
}
const SN5_PLANTILLAS_PROY = [{
  id: 'brief',
  label: 'Brief',
  icon: 'file-text',
  estado: 'Precargado',
  nota: 'Cliente, fechas y locación ya llenos. Falta objetivo y mensaje clave.'
}, {
  id: 'stakeholders',
  label: 'Stakeholders',
  icon: 'users',
  estado: 'Precargado',
  nota: 'Responsables asignados del proyecto. Falta contraparte del cliente.'
}, {
  id: 'ruta',
  label: 'Ruta crítica',
  icon: 'git-branch',
  estado: 'Vacío',
  nota: 'Hitos por definir a partir de la fecha de entrega.'
}, {
  id: 'roadmap',
  label: 'Roadmap',
  icon: 'calendar',
  estado: 'Vacío',
  nota: 'Vista panorámica por semanas, no documento extenso.'
}];
function Asistente() {
  const [msgs, setMsgs] = React.useState([{
    de: 'ia',
    txt: 'Puedo cruzar datos de proyectos anteriores. Pregúntame por equipos, proveedores o riesgos que ya vivimos.'
  }]);
  const [q, setQ] = React.useState('');
  const send = () => {
    if (!q.trim()) return;
    const pregunta = q.trim();
    setMsgs(m => [...m, {
      de: 'yo',
      txt: pregunta
    }, {
      de: 'ia',
      txt: 'Buscando en 6 proyectos cerrados…'
    }]);
    setQ('');
    setTimeout(() => setMsgs(m => [...m.slice(0, -1), {
      de: 'ia',
      txt: 'En proyectos similares (Spot TV 30" y Campaña Lanzamiento) el riesgo repetido fue el permiso de locación: en ambos llegó 48 h antes del llamado. Marta Quiroz lo gestionó las dos veces. Sugiero abrir el trámite al pasar a PREPRODUCCIÓN.',
      fuentes: ['SH007 · Spot TV 30"', 'SH009 · Campaña Lanzamiento']
    }]), 900);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)',
      maxHeight: 260,
      overflowY: 'auto'
    }
  }, msgs.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      gap: 11,
      justifyContent: m.de === 'yo' ? 'flex-end' : 'flex-start'
    }
  }, m.de === 'ia' ? /*#__PURE__*/React.createElement(Avatar, {
    initials: "S",
    size: 26
  }) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '78%',
      padding: '11px 14px',
      borderRadius: 'var(--radius-input)',
      background: m.de === 'yo' ? 'var(--accent)' : 'var(--surface-row)',
      color: m.de === 'yo' ? 'var(--sn-orange-ink)' : 'var(--text-body)',
      fontSize: 'var(--text-base)',
      lineHeight: 'var(--lh-body)'
    }
  }, m.txt, m.fuentes ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 7,
      flexWrap: 'wrap',
      marginTop: 11
    }
  }, m.fuentes.map(f => /*#__PURE__*/React.createElement("span", {
    key: f,
    style: {
      padding: '4px 10px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, f))) : null)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement(SearchInput, {
    size: "lg",
    value: q,
    onChange: e => setQ(e.target.value),
    onKeyDown: e => e.key === 'Enter' && send(),
    placeholder: "\xBFQu\xE9 deber\xEDamos prevenir en este proyecto?",
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconLeft: "send",
    onClick: send
  }, "Preguntar")));
}
function DetallePanel({
  p,
  onClose
}) {
  const [tab, setTab] = React.useState('general');
  const [estado, setEstado] = React.useState(p.estado);
  const tabs = [{
    id: 'general',
    label: 'General'
  }, {
    id: 'plantillas',
    label: 'Plantillas'
  }, {
    id: 'documentos',
    label: 'Documentos'
  }, {
    id: 'asistente',
    label: 'Asistente'
  }];
  const partidas = window.SN5.cuentasPagar.filter(c => c.folio === p.folio);
  return /*#__PURE__*/React.createElement(window.Modal, {
    title: p.nombre,
    eyebrow: p.folio + ' · ' + p.cliente,
    width: 980,
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "lg",
      iconLeft: "printer"
    }, "Hoja de llamado (PDF)"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "lg",
      iconLeft: "calendar"
    }, "Agregar a Google Calendar"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "lg",
      iconLeft: "git-branch"
    }, "Crear complementaria"))
  }, /*#__PURE__*/React.createElement(FilterTabs, {
    tabs: tabs,
    value: tab,
    onChange: setTab,
    style: {
      marginBottom: 'var(--space-lg)'
    }
  }), tab === 'general' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(window.Field, {
    label: "Estado"
  }, /*#__PURE__*/React.createElement(Select, {
    size: "md",
    value: estado,
    onChange: e => setEstado(e.target.value),
    options: window.SN5.estadosProyecto,
    style: {
      width: '100%'
    }
  })), /*#__PURE__*/React.createElement(window.Field, {
    label: "Fecha de entrega",
    value: p.entrega
  }), /*#__PURE__*/React.createElement(window.Field, {
    label: "Avance"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 8
    }
  }, /*#__PURE__*/React.createElement(window.ProgressBar, {
    value: p.progreso
  }))), /*#__PURE__*/React.createElement(window.Field, {
    label: "Locaci\xF3n",
    value: p.locacion
  }), /*#__PURE__*/React.createElement(window.Field, {
    label: "Horarios",
    value: p.horarios
  }), /*#__PURE__*/React.createElement(window.Field, {
    label: "Punto de encuentro",
    value: p.punto
  })), estado === 'FINALIZADO' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: 'var(--space-lg)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--sn-status-approved-bg)',
      color: 'var(--sn-status-approved-fg)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check-circle",
    size: 18
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-base)'
    }
  }, "Proyecto cerrado el d\xEDa siguiente a la entrega. El reporte de cierre y la ficha de \xF3rdenes de pago ya se generaron."), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "md"
  }, "Ver reporte de cierre")) : null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sn-label",
    style: {
      marginBottom: 11
    }
  }, "Partidas heredadas de la cotizaci\xF3n aprobada"), /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    tone: "row"
  }, /*#__PURE__*/React.createElement(DataTable, {
    minWidth: 620,
    columns: [{
      key: 'descripcion',
      label: 'Concepto',
      width: '1.6fr',
      strong: true
    }, {
      key: 'responsable',
      label: 'Responsable',
      width: '1fr'
    }, {
      key: 'total',
      label: 'X pagar',
      width: '120px',
      align: 'right',
      render: r => window.SN5_MXN(r.total)
    }, {
      key: 'estado',
      label: 'Cuenta',
      width: '120px',
      align: 'right',
      render: r => /*#__PURE__*/React.createElement(window.SNBadge, {
        state: r.estado
      })
    }],
    rows: partidas,
    emptyLabel: "Este proyecto no tiene partidas ligadas"
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '11px 0 0',
      fontSize: 'var(--text-md)',
      color: 'var(--text-faint)',
      lineHeight: 'var(--lh-snug)'
    }
  }, "Si cambias el responsable de una partida, la cuenta por pagar correspondiente se actualiza con el mismo responsable y monto."))) : null, tab === 'plantillas' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, SN5_PLANTILLAS_PROY.map(t => /*#__PURE__*/React.createElement(Card, {
    key: t.id,
    padding: "var(--space-lg)",
    tone: "row",
    style: {
      display: 'flex',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: t.icon,
    size: 18,
    color: "var(--accent)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-lg)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-primary)'
    }
  }, t.label), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: t.estado === 'Precargado' ? 'var(--sn-status-approved-fg)' : 'var(--text-faint)'
    }
  }, t.estado)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '7px 0 13px',
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)',
      lineHeight: 'var(--lh-snug)'
    }
  }, t.nota), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "md"
  }, "Abrir"))))) : null, tab === 'documentos' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)'
    }
  }, [{
    n: 'Hoja de llamado · 25 abr',
    e: 'validado'
  }, {
    n: 'Cotización aprobada ' + p.folio + '.pdf',
    e: 'validado'
  }, {
    n: 'Permiso de locación',
    e: 'pendiente'
  }, {
    n: 'Reporte de cierre',
    e: p.estado === 'FINALIZADO' ? 'validado' : 'pendiente'
  }].map(d => /*#__PURE__*/React.createElement("div", {
    key: d.n,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: '13px var(--space-lg)',
      background: 'var(--surface-row)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-text",
    size: 16,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }, d.n), /*#__PURE__*/React.createElement(window.SNBadge, {
    state: d.e
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "md",
    iconLeft: "download"
  }, "Descargar"))), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    iconLeft: "plus",
    style: {
      alignSelf: 'flex-start'
    }
  }, "Subir documento")) : null, tab === 'asistente' ? /*#__PURE__*/React.createElement(Asistente, null) : null);
}
function ProyectosScreen() {
  const all = window.SN5.proyectos;
  const [vista, setVista] = React.useState('tablero');
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(null);
  const proyectos = all.filter(p => {
    const t = q.trim().toLowerCase();
    return !t || (p.folio + ' ' + p.nombre + ' ' + p.cliente).toLowerCase().includes(t);
  });
  const columns = [{
    key: 'folio',
    label: 'Folio',
    width: '90px',
    render: r => /*#__PURE__*/React.createElement(window.Folio, null, r.folio)
  }, {
    key: 'nombre',
    label: 'Proyecto',
    width: '1.5fr',
    strong: true
  }, {
    key: 'cliente',
    label: 'Cliente',
    width: '1fr'
  }, {
    key: 'entrega',
    label: 'Entrega',
    width: '1fr'
  }, {
    key: 'locacion',
    label: 'Locación',
    width: '1.2fr'
  }, {
    key: 'equipo',
    label: 'Equipo',
    width: '120px',
    render: r => /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex'
      }
    }, r.equipo.map((e, i) => /*#__PURE__*/React.createElement(Avatar, {
      key: e,
      initials: e,
      size: 22,
      style: {
        marginLeft: i ? -7 : 0,
        border: '2px solid var(--surface-card)'
      }
    })))
  }, {
    key: 'estado',
    label: 'Estado',
    width: '140px',
    align: 'right',
    render: r => /*#__PURE__*/React.createElement(window.SNBadge, {
      state: r.estado
    })
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionHero, {
    title: "Proyectos",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      iconLeft: "plus"
    }, "Nuevo proyecto")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(SearchInput, {
    size: "lg",
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Buscar por proyecto, cliente o folio\u2026",
    style: {
      flex: '0 1 420px',
      minWidth: 240
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      flexWrap: 'nowrap',
      minWidth: 0,
      overflowX: 'auto',
      paddingBottom: 2
    }
  }, /*#__PURE__*/React.createElement(FilterTabs, {
    tabs: [{
      id: 'tablero',
      label: 'Tablero'
    }, {
      id: 'lista',
      label: 'Lista'
    }, {
      id: 'calendario',
      label: 'Calendario'
    }],
    value: vista,
    onChange: setVista,
    style: {
      flex: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 12
    }
  }), /*#__PURE__*/React.createElement(FilterButton, {
    style: {
      flex: 'none'
    }
  })), vista === 'tablero' ? /*#__PURE__*/React.createElement(Tablero, {
    proyectos: proyectos,
    onOpen: setOpen
  }) : null, vista === 'lista' ? /*#__PURE__*/React.createElement(Card, {
    padding: "0"
  }, /*#__PURE__*/React.createElement(DataTable, {
    columns: columns,
    rows: proyectos,
    onRowClick: setOpen,
    emptyLabel: "Ning\xFAn proyecto coincide"
  }), /*#__PURE__*/React.createElement(TableFooter, {
    shown: proyectos.length,
    total: all.length,
    unit: "proyectos"
  })) : null, vista === 'calendario' ? /*#__PURE__*/React.createElement(Calendario, {
    proyectos: proyectos,
    onOpen: setOpen
  }) : null, open ? /*#__PURE__*/React.createElement(DetallePanel, {
    p: open,
    onClose: () => setOpen(null)
  }) : null);
}
Object.assign(window, {
  ProyectosScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/ProyectosScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/ResponsablesScreen.jsx
try { (() => {
/* 6 · Responsables (colaboradores / freelancers). Lista en grilla, alta y
   detalle con historial de proyectos y total acumulado. Fase 5 no cambia el
   fondo de esta pantalla: se conserva tal cual está hoy. */
const {
  Button,
  Card,
  Icon,
  Avatar,
  SearchInput,
  TextField,
  FilterTabs,
  StatusBadge,
  DataTable,
  SectionHero
} = window.SerenataDesignSystem_993393;
function ContactoRow({
  icon,
  children
}) {
  if (!children) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 14,
    color: "var(--text-faint)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, children));
}
function RolTag({
  children,
  onRemove
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      padding: onRemove ? '5px 7px 5px 12px' : '5px 12px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-row-alt)',
      border: '1px solid var(--border-subtle)',
      fontSize: 'var(--text-md)',
      color: 'var(--text-body)'
    }
  }, children, onRemove ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onRemove,
    "aria-label": 'Quitar ' + children,
    style: {
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      color: 'var(--text-faint)',
      padding: 0,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 13
  })) : null);
}
function ColaboradorForm({
  r,
  onClose,
  nuevo
}) {
  const [activo, setActivo] = React.useState(r ? r.activo : true);
  const [roles, setRoles] = React.useState(r ? r.roles : []);
  const [nuevoRol, setNuevoRol] = React.useState('');
  const [nombre, setNombre] = React.useState(r ? r.nombre : '');
  const [error, setError] = React.useState('');
  const total = r ? r.historial.reduce((a, h) => a + h.monto, 0) : 0;
  const guardar = () => {
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    onClose();
  };
  return /*#__PURE__*/React.createElement(window.Modal, {
    title: nuevo ? 'Nuevo colaborador' : r.nombre,
    eyebrow: nuevo ? 'Responsables' : roles.join(' · '),
    width: 900,
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, !nuevo ? /*#__PURE__*/React.createElement(FilterTabs, {
      tabs: [{
        id: true,
        label: 'Activo'
      }, {
        id: false,
        label: 'Inactivo'
      }],
      value: activo,
      onChange: setActivo
    }) : null, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "lg",
      onClick: onClose
    }, "Cancelar"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      onClick: guardar
    }, nuevo ? 'Crear colaborador' : 'Guardar cambios'))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xl)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    label: "Nombre \xB7 requerido",
    value: nombre,
    onChange: e => {
      setNombre(e.target.value);
      setError('');
    },
    placeholder: "Nombre y apellido",
    hint: error
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "Tel\xE9fono",
    defaultValue: r ? r.telefono : '',
    placeholder: "33 0000 0000"
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "Correo",
    defaultValue: r ? r.correo : '',
    placeholder: "nombre@dominio.mx"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sn-label",
    style: {
      marginBottom: 11
    }
  }, "Roles"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 9,
      flexWrap: 'wrap',
      marginBottom: roles.length ? 'var(--space-md)' : 0
    }
  }, roles.map(x => /*#__PURE__*/React.createElement(RolTag, {
    key: x,
    onRemove: () => setRoles(roles.filter(y => y !== x))
  }, x))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-md)',
      alignItems: 'flex-end',
      maxWidth: 420
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    label: "Agregar rol",
    value: nuevoRol,
    onChange: e => setNuevoRol(e.target.value),
    placeholder: "Ej. Director de Fotograf\xEDa"
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "md",
    onClick: () => {
      if (nuevoRol.trim()) {
        setRoles([...roles, nuevoRol.trim()]);
        setNuevoRol('');
      }
    }
  }, "Agregar"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    label: "Banco",
    defaultValue: r ? r.banco : '',
    placeholder: "BBVA"
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "CLABE \xB7 18 d\xEDgitos",
    defaultValue: r ? r.clabe : '',
    placeholder: "000000000000000000",
    maxLength: 18
  })), /*#__PURE__*/React.createElement(window.Field, {
    label: "Notas"
  }, /*#__PURE__*/React.createElement("textarea", {
    defaultValue: r ? r.notas : '',
    rows: 2,
    placeholder: "Acuerdos, condiciones, equipo propio\u2026",
    style: {
      width: '100%',
      padding: '10px 12px',
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      outline: 'none',
      resize: 'vertical',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)',
      lineHeight: 'var(--lh-body)'
    }
  })), !nuevo ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'var(--space-md)',
      marginBottom: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sn-label"
  }, "Historial de proyectos"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, "Total acumulado"), /*#__PURE__*/React.createElement("span", {
    className: "sn-display",
    style: {
      fontSize: 'var(--text-h3)',
      color: 'var(--accent)'
    }
  }, window.SN5_MXN(total))), /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    tone: "row"
  }, /*#__PURE__*/React.createElement(DataTable, {
    minWidth: 0,
    columns: [{
      key: 'proyecto',
      label: 'Proyecto',
      width: '1.4fr',
      strong: true
    }, {
      key: 'cliente',
      label: 'Cliente',
      width: '1fr'
    }, {
      key: 'fecha',
      label: 'Fecha del evento',
      width: '1fr'
    }, {
      key: 'rol',
      label: 'Rol',
      width: '1.2fr'
    }, {
      key: 'monto',
      label: 'X pagar',
      width: '110px',
      align: 'right',
      render: h => window.SN5_MXN(h.monto)
    }],
    rows: r.historial,
    emptyLabel: "Todav\xEDa no participa en ning\xFAn proyecto"
  }))) : null));
}
function ResponsablesScreen() {
  const all = window.SN5.responsables;
  const [q, setQ] = React.useState('');
  const [abierto, setAbierto] = React.useState(null);
  const [nuevo, setNuevo] = React.useState(false);
  const rows = all.filter(r => !q.trim() || r.nombre.toLowerCase().includes(q.trim().toLowerCase()));
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionHero, {
    title: "Responsables",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      iconLeft: "plus",
      onClick: () => setNuevo(true)
    }, "Nuevo colaborador")
  }), /*#__PURE__*/React.createElement(SearchInput, {
    size: "lg",
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Buscar por nombre\u2026",
    style: {
      alignSelf: 'flex-start',
      width: '100%',
      maxWidth: 420
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))',
      gap: 'var(--space-lg)'
    }
  }, rows.map(r => /*#__PURE__*/React.createElement(Card, {
    key: r.nombre,
    onClick: () => setAbierto(r),
    padding: "var(--space-lg)",
    style: {
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)',
      minWidth: 0,
      opacity: r.activo ? 1 : 0.55
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    initials: r.initials,
    size: 38,
    tone: r.activo ? 'accent' : 'neutral'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-lg)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-primary)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, r.nombre), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-faint)'
    }
  }, r.historial.length, " proyecto", r.historial.length === 1 ? '' : 's')), /*#__PURE__*/React.createElement(StatusBadge, {
    status: r.activo ? 'aprobada' : 'borrador'
  }, r.activo ? 'Activo' : 'Inactivo')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 7,
      flexWrap: 'wrap'
    }
  }, r.roles.map(x => /*#__PURE__*/React.createElement(RolTag, {
    key: x
  }, x))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      paddingTop: 'var(--space-md)',
      borderTop: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement(ContactoRow, {
    icon: "phone"
  }, r.telefono), /*#__PURE__*/React.createElement(ContactoRow, {
    icon: "mail"
  }, r.correo), /*#__PURE__*/React.createElement(ContactoRow, {
    icon: "landmark"
  }, r.banco))))), abierto ? /*#__PURE__*/React.createElement(ColaboradorForm, {
    r: abierto,
    onClose: () => setAbierto(null)
  }) : null, nuevo ? /*#__PURE__*/React.createElement(ColaboradorForm, {
    nuevo: true,
    onClose: () => setNuevo(false)
  }) : null);
}
Object.assign(window, {
  ResponsablesScreen,
  RolTag
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/ResponsablesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/data.js
try { (() => {
/* Datos de muestra para el kit Fase 5. Todo es ficticio pero respeta las reglas
   de negocio del brief: "X Pagar" es neto al proveedor, el fee de agencia es
   15% por default, y el IVA del cliente es 16% sobre subtotal+fee. */
window.SN5 = {
  user: {
    name: 'Carla Mendoza',
    nickname: '@carlam',
    initials: 'CM'
  },
  nav: [{
    id: 'inicio',
    label: 'Inicio'
  }, {
    id: 'cotizaciones',
    label: 'Cotizaciones'
  }, {
    id: 'proyectos',
    label: 'Proyectos'
  }, {
    id: 'cuentas',
    label: 'Cuentas'
  }, {
    id: 'portal',
    label: 'Portal'
  }, {
    id: 'responsables',
    label: 'Responsables'
  }, {
    id: 'planeacion',
    label: 'Planeación'
  }, {
    id: 'plantillas',
    label: 'Plantillas'
  }, {
    id: 'admin',
    label: 'Admin'
  }],
  pendientes: {
    responsables: 'Responsables · Fase 5 no prevé cambios de fondo. La pantalla actual se conserva: grilla de tarjetas con inicial como avatar, roles como etiquetas y datos bancarios, más historial de proyectos con total acumulado.',
    planeacion: 'Planeación · Fase 5 no prevé cambios de fondo. Se conserva el wizard de 4 pasos que convierte mensajes informales en cotizaciones con extracción por IA.',
    plantillas: 'Plantillas de Servicios · Fase 5 no prevé cambios de fondo. Se conserva la grilla con preview de los primeros 3 items y la tabla editable de partidas. Pendiente confirmar cómo integra con cotizaciones complementarias.',
    admin: 'Admin · Usuarios y Sincronización con Google Sheets. Fase 5 no prevé cambios de fondo.'
  },
  cotizaciones: [{
    folio: 'SH014',
    proyecto: 'Campaña Verano 2025',
    cliente: 'Solura',
    total: 1093250,
    entrega: '25 abr 2025',
    estatus: 'aprobada'
  }, {
    folio: 'SH013',
    proyecto: 'Campaña Verano 2025',
    cliente: 'Solura',
    total: 214600,
    entrega: '25 abr 2025',
    estatus: 'emitida',
    complementariaDe: 'SH014'
  }, {
    folio: 'SH012',
    proyecto: 'Documental Raíces',
    cliente: 'Canal Norte',
    total: 483000,
    entrega: '23 abr 2025',
    estatus: 'emitida'
  }, {
    folio: 'SH011',
    proyecto: 'Serie Digital / Episodio 1',
    cliente: 'Vista Media',
    total: 0,
    entrega: '20 abr 2025',
    estatus: 'borrador',
    sinItems: true
  }, {
    folio: 'SH010',
    proyecto: 'Video Institucional',
    cliente: 'Grupo Alba',
    total: 356500,
    entrega: '18 abr 2025',
    estatus: 'emitida'
  }, {
    folio: 'SH009',
    proyecto: 'Campaña Lanzamiento',
    cliente: 'Nimbo',
    total: 770500,
    entrega: '15 abr 2025',
    estatus: 'aprobada'
  }, {
    folio: 'SH008',
    proyecto: 'Contenido Redes Q2',
    cliente: 'Lúmina',
    total: 264500,
    entrega: '12 abr 2025',
    estatus: 'cancelada'
  }, {
    folio: 'SH007',
    proyecto: 'Spot TV 30"',
    cliente: 'Terranova',
    total: 1127000,
    entrega: '08 abr 2025',
    estatus: 'emitida'
  }, {
    folio: 'SH006',
    proyecto: 'Aftermovie Festival',
    cliente: 'Distrito',
    total: 184000,
    entrega: '05 abr 2025',
    estatus: 'borrador'
  }],
  cotizacion: {
    folio: 'SH014',
    fecha: '02 abr 2025',
    cliente: 'Solura',
    proyecto: 'Campaña Verano 2025',
    entrega: '25 abr 2025',
    locacion: 'Hacienda El Carmen, Jalisco',
    notas: 'El cliente pidió dos versiones del corte final (60" y 30"). No incluir el costo de la segunda versión hasta que confirmen presupuesto.',
    estatus: 'aprobada',
    fee: 15,
    iva: true,
    descuentoTipo: 'monto',
    descuento: 0,
    partidas: [{
      categoria: 'Dirección',
      descripcion: 'Dirección y guion',
      cantidad: 1,
      precio: 84000,
      responsable: 'Julián López',
      xPagar: 60000
    }, {
      categoria: 'Producción',
      descripcion: 'Equipo de cámara (3 días)',
      cantidad: 3,
      precio: 42000,
      responsable: 'Ana Vidal',
      xPagar: 96000
    }, {
      categoria: 'Producción',
      descripcion: 'Locaciones y permisos',
      cantidad: 1,
      precio: 56000,
      responsable: 'Marta Quiroz',
      xPagar: 41000
    }, {
      categoria: 'Post',
      descripcion: 'Postproducción y color',
      cantidad: 1,
      precio: 78000,
      responsable: 'Hugo Peña',
      xPagar: 55000
    }, {
      categoria: 'Post',
      descripcion: 'Música original',
      cantidad: 2,
      precio: 28000,
      responsable: 'Distrito Sonoro',
      xPagar: 38000
    }, {
      categoria: 'Talento',
      descripcion: 'Casting principal (2 perfiles)',
      cantidad: 2,
      precio: 45000,
      responsable: 'Paula Iriarte',
      xPagar: 66000
    }, {
      categoria: 'Arte',
      descripcion: 'Diseño de arte y utilería',
      cantidad: 1,
      precio: 63000,
      responsable: 'Ana Vidal',
      xPagar: 44000
    }],
    presencia: [{
      initials: 'JL',
      name: 'Julián López',
      seccion: 'Partidas'
    }, {
      initials: 'AV',
      name: 'Ana Vidal',
      seccion: 'Totales'
    }]
  },
  plantillasServicios: ['Rodaje 1 día · básico', 'Rodaje 3 días · completo', 'Solo post', 'Fotografía de producto'],
  proyectos: [{
    folio: 'SH014',
    nombre: 'Campaña Verano 2025',
    cliente: 'Solura',
    entrega: '25 abr 2025',
    locacion: 'Hacienda El Carmen, Jalisco',
    estado: 'RODAJE',
    progreso: 62,
    equipo: ['JL', 'AV', 'HP'],
    horarios: 'Llamado 06:30 · Wrap estimado 20:00',
    punto: 'Av. Vallarta 1500, estacionamiento norte'
  }, {
    folio: 'SH012',
    nombre: 'Documental Raíces',
    cliente: 'Canal Norte',
    entrega: '23 abr 2025',
    locacion: 'Oaxaca centro',
    estado: 'PREPRODUCCIÓN',
    progreso: 18,
    equipo: ['MQ', 'AV'],
    horarios: 'Scouting 09:00',
    punto: 'Hotel Quinta Real, lobby'
  }, {
    folio: 'SH010',
    nombre: 'Video Institucional',
    cliente: 'Grupo Alba',
    entrega: '18 abr 2025',
    locacion: 'Corporativo Alba, CDMX',
    estado: 'POSTPRODUCCIÓN',
    progreso: 84,
    equipo: ['HP'],
    horarios: 'Revisión de corte 11:00',
    punto: 'Sala 4, piso 12'
  }, {
    folio: 'SH009',
    nombre: 'Campaña Lanzamiento',
    cliente: 'Nimbo',
    entrega: '15 abr 2025',
    locacion: 'Foro Nimbo, Monterrey',
    estado: 'RODAJE',
    progreso: 45,
    equipo: ['JL', 'PI'],
    horarios: 'Llamado 07:00',
    punto: 'Foro 2, acceso de carga'
  }, {
    folio: 'SH007',
    nombre: 'Spot TV 30"',
    cliente: 'Terranova',
    entrega: '08 abr 2025',
    locacion: 'Puebla, casco antiguo',
    estado: 'FINALIZADO',
    progreso: 100,
    equipo: ['AV', 'HP', 'MQ'],
    horarios: 'Entregado',
    punto: '—'
  }, {
    folio: 'SH006',
    nombre: 'Aftermovie Festival',
    cliente: 'Distrito',
    entrega: '05 abr 2025',
    locacion: 'Explanada Distrito',
    estado: 'FINALIZADO',
    progreso: 100,
    equipo: ['JL'],
    horarios: 'Entregado',
    punto: '—'
  }],
  estadosProyecto: ['PREPRODUCCIÓN', 'RODAJE', 'POSTPRODUCCIÓN', 'FINALIZADO'],
  cuentasCobrar: [{
    folio: 'SH014',
    cliente: 'Solura',
    proyecto: 'Campaña Verano 2025',
    pagado: 546625,
    total: 1093250,
    vencimiento: '10 may 2025',
    estado: 'PARCIALMENTE_PAGADO'
  }, {
    folio: 'SH012',
    cliente: 'Canal Norte',
    proyecto: 'Documental Raíces',
    pagado: 0,
    total: 483000,
    vencimiento: '05 may 2025',
    estado: 'FACTURADO'
  }, {
    folio: 'SH010',
    cliente: 'Grupo Alba',
    proyecto: 'Video Institucional',
    pagado: 0,
    total: 356500,
    vencimiento: '28 abr 2025',
    estado: 'VENCIDO'
  }, {
    folio: 'SH009',
    cliente: 'Nimbo',
    proyecto: 'Campaña Lanzamiento',
    pagado: 770500,
    total: 770500,
    vencimiento: '20 abr 2025',
    estado: 'PAGADO'
  }, {
    folio: 'SH007',
    cliente: 'Terranova',
    proyecto: 'Spot TV 30"',
    pagado: 0,
    total: 1127000,
    vencimiento: '15 may 2025',
    estado: 'FACTURA_PENDIENTE'
  }],
  cuentasPagar: [{
    folio: 'SH014',
    proyecto: 'Campaña Verano 2025',
    responsable: 'Julián López',
    regimen: 'fisica',
    descripcion: 'Dirección y guion',
    pagado: 0,
    total: 60000,
    estado: 'PENDIENTE'
  }, {
    folio: 'SH014',
    proyecto: 'Campaña Verano 2025',
    responsable: 'Ana Vidal',
    regimen: 'fisica',
    descripcion: 'Equipo de cámara (3 días)',
    pagado: 0,
    total: 96000,
    estado: 'PENDIENTE'
  }, {
    folio: 'SH014',
    proyecto: 'Campaña Verano 2025',
    responsable: 'Distrito Sonoro',
    regimen: 'moral',
    descripcion: 'Música original',
    pagado: 38000,
    total: 38000,
    estado: 'PAGADO'
  }, {
    folio: 'SH012',
    proyecto: 'Documental Raíces',
    responsable: 'Marta Quiroz',
    regimen: 'fisica',
    descripcion: 'Locaciones y permisos',
    pagado: 0,
    total: 41000,
    estado: 'EN_PROCESO_PAGO'
  }, {
    folio: 'SH010',
    proyecto: 'Video Institucional',
    responsable: 'Hugo Peña',
    regimen: 'fisica',
    descripcion: 'Postproducción y color',
    pagado: 0,
    total: 55000,
    estado: 'PENDIENTE'
  }, {
    folio: 'SH007',
    proyecto: 'Spot TV 30"',
    responsable: 'Distrito Sonoro',
    regimen: 'moral',
    descripcion: 'Mezcla y master',
    pagado: 24000,
    total: 24000,
    estado: 'PAGADO'
  }],
  colaborador: {
    nombre: 'Ana Vidal',
    initials: 'AV',
    telefono: '33 1842 0071',
    correo: 'ana@vidalfoto.mx',
    banco: 'BBVA',
    clabe: '012320004512378901',
    regimen: 'fisica',
    roles: ['Directora de Fotografía', 'Operadora de cámara'],
    documentos: [{
      nombre: 'Constancia de situación fiscal',
      estado: 'validado',
      fecha: '12 mar 2025'
    }, {
      nombre: 'INE (frente y vuelta)',
      estado: 'validado',
      fecha: '12 mar 2025'
    }, {
      nombre: 'Contrato marco firmado',
      estado: 'pendiente',
      fecha: '—'
    }],
    facturas: [{
      id: 'F-2291',
      proyecto: 'Campaña Verano 2025',
      cuenta: 'SH014',
      monto: 96000,
      estado: 'validado',
      fecha: '26 abr 2025'
    }, {
      id: 'F-2264',
      proyecto: 'Documental Raíces',
      cuenta: 'SH012',
      monto: 41000,
      estado: 'revision',
      fecha: '24 abr 2025'
    }, {
      id: 'F-2210',
      proyecto: 'Spot TV 30"',
      cuenta: 'SH007',
      monto: 52000,
      estado: 'rechazado',
      fecha: '09 abr 2025'
    }]
  },
  dashboard: {
    periodo: 'Abril 2025',
    kpis: [{
      id: 'cobrar',
      label: 'Por cobrar',
      valor: 1966500,
      nota: '4 cuentas abiertas'
    }, {
      id: 'pagar',
      label: 'Por pagar',
      valor: 252000,
      nota: '4 responsables'
    }, {
      id: 'aprobadas',
      label: 'Cotizaciones aprobadas',
      valor: 2,
      nota: 'de 9 emitidas',
      moneda: false
    }, {
      id: 'borrador',
      label: 'En borrador',
      valor: 2,
      nota: '1 sin items',
      moneda: false
    }],
    balance: [{
      mes: 'Nov',
      ingresos: 980,
      egresos: 640
    }, {
      mes: 'Dic',
      ingresos: 1420,
      egresos: 910
    }, {
      mes: 'Ene',
      ingresos: 760,
      egresos: 700
    }, {
      mes: 'Feb',
      ingresos: 1180,
      egresos: 820
    }, {
      mes: 'Mar',
      ingresos: 1640,
      egresos: 1050
    }, {
      mes: 'Abr',
      ingresos: 1966,
      egresos: 1240
    }],
    fiscal: {
      ingresos: 1966500,
      egresos: 1240000,
      impuestos: 217950,
      deudas: 252000
    },
    actividad: [{
      label: 'Proyectos ejecutados',
      valor: '6'
    }, {
      label: 'Cotizaciones aprobadas',
      valor: '2 de 9'
    }, {
      label: 'Proyectos que cruzan de mes',
      valor: '2'
    }, {
      label: 'Ticket promedio',
      valor: '$ 572,317'
    }],
    gastosFijos: [{
      label: 'Nómina',
      monto: 420000
    }, {
      label: 'Renta y servicios',
      monto: 96000
    }, {
      label: 'Software y licencias',
      monto: 38000
    }, {
      label: 'Contabilidad',
      monto: 24000
    }],
    facturadoMes: 1093250
  },
  responsables: [{
    nombre: 'Ana Vidal',
    initials: 'AV',
    activo: true,
    roles: ['Directora de Fotografía', 'Operadora de cámara'],
    telefono: '33 1842 0071',
    correo: 'ana@vidalfoto.mx',
    banco: 'BBVA',
    clabe: '012320004512378901',
    notas: 'Trae su propio kit de lentes. Cobra viáticos aparte.',
    historial: [{
      proyecto: 'Campaña Verano 2025',
      cliente: 'Solura',
      fecha: '25 abr 2025',
      rol: 'Directora de Fotografía',
      monto: 96000
    }, {
      proyecto: 'Documental Raíces',
      cliente: 'Canal Norte',
      fecha: '23 abr 2025',
      rol: 'Operadora de cámara',
      monto: 41000
    }, {
      proyecto: 'Spot TV 30"',
      cliente: 'Terranova',
      fecha: '08 abr 2025',
      rol: 'Directora de Fotografía',
      monto: 52000
    }]
  }, {
    nombre: 'Julián López',
    initials: 'JL',
    activo: true,
    roles: ['Director'],
    telefono: '55 2201 8834',
    correo: 'julian@lopezfilms.mx',
    banco: 'Santander',
    clabe: '014180005598234412',
    notas: '',
    historial: [{
      proyecto: 'Campaña Verano 2025',
      cliente: 'Solura',
      fecha: '25 abr 2025',
      rol: 'Director',
      monto: 60000
    }, {
      proyecto: 'Aftermovie Festival',
      cliente: 'Distrito',
      fecha: '05 abr 2025',
      rol: 'Director',
      monto: 34000
    }]
  }, {
    nombre: 'Marta Quiroz',
    initials: 'MQ',
    activo: true,
    roles: ['Productora de locaciones', 'Permisos'],
    telefono: '99 3310 2245',
    correo: 'marta@quiroz.mx',
    banco: 'Banorte',
    clabe: '072580001122334455',
    notas: 'Gestiona permisos de Oaxaca y Jalisco.',
    historial: [{
      proyecto: 'Documental Raíces',
      cliente: 'Canal Norte',
      fecha: '23 abr 2025',
      rol: 'Permisos',
      monto: 41000
    }]
  }, {
    nombre: 'Hugo Peña',
    initials: 'HP',
    activo: true,
    roles: ['Editor', 'Colorista'],
    telefono: '22 4471 9008',
    correo: 'hugo@penapost.mx',
    banco: 'BBVA',
    clabe: '012650007788990011',
    notas: '',
    historial: [{
      proyecto: 'Video Institucional',
      cliente: 'Grupo Alba',
      fecha: '18 abr 2025',
      rol: 'Colorista',
      monto: 55000
    }, {
      proyecto: 'Spot TV 30"',
      cliente: 'Terranova',
      fecha: '08 abr 2025',
      rol: 'Editor',
      monto: 28000
    }]
  }, {
    nombre: 'Paula Iriarte',
    initials: 'PI',
    activo: true,
    roles: ['Directora de casting'],
    telefono: '55 8890 3312',
    correo: 'paula@casting.mx',
    banco: 'HSBC',
    clabe: '021180004455667788',
    notas: '',
    historial: [{
      proyecto: 'Campaña Verano 2025',
      cliente: 'Solura',
      fecha: '25 abr 2025',
      rol: 'Directora de casting',
      monto: 66000
    }]
  }, {
    nombre: 'Distrito Sonoro',
    initials: 'DS',
    activo: false,
    roles: ['Diseño sonoro', 'Música original'],
    telefono: '55 6612 0091',
    correo: 'hola@distritosonoro.mx',
    banco: 'Banregio',
    clabe: '058320009900112233',
    notas: 'Persona moral. Factura con IVA acreditable.',
    historial: [{
      proyecto: 'Campaña Verano 2025',
      cliente: 'Solura',
      fecha: '25 abr 2025',
      rol: 'Música original',
      monto: 38000
    }, {
      proyecto: 'Spot TV 30"',
      cliente: 'Terranova',
      fecha: '08 abr 2025',
      rol: 'Mezcla y master',
      monto: 24000
    }]
  }],
  planeacion: {
    mensaje: 'Hola! Oye para el evento del 12 de junio en el Foro Nimbo de Monterrey necesitamos cobertura de video, son 2 días de rodaje (12 y 13). Es para la campaña de lanzamiento del producto nuevo. El punto de encuentro sería el estacionamiento del foro a las 7am. Nos urge la cotización esta semana. Gracias!',
    extraidos: [{
      proyecto: 'Campaña Lanzamiento Producto',
      cliente: 'Nimbo',
      fecha: '12 jun 2025',
      fin: '13 jun 2025',
      locacion: 'Foro Nimbo, Monterrey',
      notaIA: 'El mensaje menciona 2 días de rodaje consecutivos. Se asume un solo evento con dos jornadas, no dos eventos separados.'
    }],
    pendientes: [{
      id: 'EV-041',
      asunto: 'Aftermovie Expo Guadalajara',
      origen: 'WhatsApp · Rodrigo Salas',
      recibido: '02 may 2025',
      falta: 'Sin fecha confirmada'
    }, {
      id: 'EV-039',
      asunto: 'Video corporativo Q3',
      origen: 'Email · Paula Iriarte',
      recibido: '28 abr 2025',
      falta: 'Sin locación'
    }, {
      id: 'EV-036',
      asunto: 'Contenido para redes · Lúmina',
      origen: 'WhatsApp · Marta Quiroz',
      recibido: '24 abr 2025',
      falta: 'Sin cliente en catálogo'
    }]
  },
  plantillas: [{
    nombre: 'Rodaje 1 día · básico',
    descripcion: 'Equipo mínimo para una jornada de rodaje con un solo set.',
    items: [{
      categoria: 'Dirección',
      descripcion: 'Dirección',
      cantidad: 1,
      precio: 28000,
      responsable: 'Julián López',
      xPagar: 20000
    }, {
      categoria: 'Producción',
      descripcion: 'Equipo de cámara (1 día)',
      cantidad: 1,
      precio: 42000,
      responsable: 'Ana Vidal',
      xPagar: 32000
    }, {
      categoria: 'Producción',
      descripcion: 'Iluminación básica',
      cantidad: 1,
      precio: 18000,
      responsable: 'Ana Vidal',
      xPagar: 13000
    }, {
      categoria: 'Post',
      descripcion: 'Edición y color',
      cantidad: 1,
      precio: 34000,
      responsable: 'Hugo Peña',
      xPagar: 24000
    }]
  }, {
    nombre: 'Rodaje 3 días · completo',
    descripcion: 'Producción completa con casting, arte y postproducción.',
    items: [{
      categoria: 'Dirección',
      descripcion: 'Dirección y guion',
      cantidad: 1,
      precio: 84000,
      responsable: 'Julián López',
      xPagar: 60000
    }, {
      categoria: 'Producción',
      descripcion: 'Equipo de cámara (3 días)',
      cantidad: 3,
      precio: 42000,
      responsable: 'Ana Vidal',
      xPagar: 96000
    }, {
      categoria: 'Talento',
      descripcion: 'Casting principal (2 perfiles)',
      cantidad: 2,
      precio: 45000,
      responsable: 'Paula Iriarte',
      xPagar: 66000
    }, {
      categoria: 'Arte',
      descripcion: 'Diseño de arte y utilería',
      cantidad: 1,
      precio: 63000,
      responsable: 'Ana Vidal',
      xPagar: 44000
    }, {
      categoria: 'Post',
      descripcion: 'Postproducción y color',
      cantidad: 1,
      precio: 78000,
      responsable: 'Hugo Peña',
      xPagar: 55000
    }, {
      categoria: 'Post',
      descripcion: 'Música original',
      cantidad: 1,
      precio: 28000,
      responsable: 'Distrito Sonoro',
      xPagar: 19000
    }]
  }, {
    nombre: 'Solo post',
    descripcion: 'Cuando el cliente entrega material grabado.',
    items: [{
      categoria: 'Post',
      descripcion: 'Edición offline',
      cantidad: 1,
      precio: 32000,
      responsable: 'Hugo Peña',
      xPagar: 23000
    }, {
      categoria: 'Post',
      descripcion: 'Corrección de color',
      cantidad: 1,
      precio: 26000,
      responsable: 'Hugo Peña',
      xPagar: 18000
    }, {
      categoria: 'Post',
      descripcion: 'Mezcla de audio',
      cantidad: 1,
      precio: 21000,
      responsable: 'Distrito Sonoro',
      xPagar: 15000
    }]
  }, {
    nombre: 'Fotografía de producto',
    descripcion: 'Sesión de estudio, entregable en 5 días.',
    items: [{
      categoria: 'Producción',
      descripcion: 'Sesión de estudio (1 día)',
      cantidad: 1,
      precio: 38000,
      responsable: 'Ana Vidal',
      xPagar: 28000
    }, {
      categoria: 'Arte',
      descripcion: 'Styling y utilería',
      cantidad: 1,
      precio: 22000,
      responsable: 'Ana Vidal',
      xPagar: 15000
    }, {
      categoria: 'Post',
      descripcion: 'Retoque (20 imágenes)',
      cantidad: 20,
      precio: 900,
      responsable: 'Hugo Peña',
      xPagar: 12000
    }]
  }],
  secciones: ['Admin', 'Dashboard', 'Cotizaciones', 'Proyectos', 'Cuentas', 'Responsables', 'Planeación'],
  usuarios: [{
    nombre: 'Carla Mendoza',
    correo: 'carla@serenata.mx',
    secciones: ['Admin', 'Dashboard', 'Cotizaciones', 'Proyectos', 'Cuentas', 'Responsables', 'Planeación'],
    activo: true,
    yo: true
  }, {
    nombre: 'Diego Ferrer',
    correo: 'diego@serenata.mx',
    secciones: ['Dashboard', 'Cotizaciones', 'Proyectos'],
    activo: true
  }, {
    nombre: 'Renata Ochoa',
    correo: 'renata@serenata.mx',
    secciones: ['Cuentas', 'Dashboard'],
    activo: true
  }, {
    nombre: 'Contabilidad externa',
    correo: 'contabilidad@despacho.mx',
    secciones: ['Cuentas'],
    activo: true
  }, {
    nombre: 'Sofía Barrera',
    correo: 'sofia@serenata.mx',
    secciones: ['Cotizaciones', 'Planeación'],
    activo: false
  }],
  sheets: {
    spreadsheetId: '1aZ8kQ2mNfP7rT4xY9bV3cL6hJ0dS5wE',
    pestanas: [{
      nombre: 'cotizaciones',
      ok: true,
      insertadas: 2,
      actualizadas: 7,
      borradas: 0,
      errores: 0
    }, {
      nombre: 'partidas',
      ok: true,
      insertadas: 14,
      actualizadas: 31,
      borradas: 2,
      errores: 0
    }, {
      nombre: 'proyectos',
      ok: true,
      insertadas: 1,
      actualizadas: 5,
      borradas: 0,
      errores: 0
    }, {
      nombre: 'cuentas_cobrar',
      ok: true,
      insertadas: 0,
      actualizadas: 5,
      borradas: 0,
      errores: 0
    }, {
      nombre: 'cuentas_pagar',
      ok: false,
      insertadas: 0,
      actualizadas: 0,
      borradas: 0,
      errores: 3
    }, {
      nombre: 'responsables',
      ok: true,
      insertadas: 0,
      actualizadas: 6,
      borradas: 0,
      errores: 0
    }]
  }
};
window.SN5_MXN = n => '$ ' + Math.round(n).toLocaleString('es-MX');
window.SN5_MXN_L = n => '$ ' + Math.round(n).toLocaleString('es-MX') + ' MXN';
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/data.js", error: String((e && e.message) || e) }); }

// ui_kits/serenata-app/parts.jsx
try { (() => {
/* Piezas compartidas del kit Fase 5.

   Panel, Metric, Field, Folio, StateBadge, ProgressBar, BarChart, ChartLegend y
   Modal también existen ahora como componentes del design system, en
   components/patterns/ — esa es la versión canónica para pantallas nuevas y para
   los templates. Este archivo mantiene su propia copia a propósito: el kit es
   una recreación que debe abrir sin depender del bundle compilado. Si cambias
   una de estas piezas, cámbiala en components/patterns/ también. */
const {
  Card,
  Button,
  Icon,
  Avatar,
  StatusBadge
} = window.SerenataDesignSystem_993393;
const SN5_STATES = {
  PREPRODUCCIÓN: {
    tone: 'borrador',
    label: 'Preproducción'
  },
  RODAJE: {
    tone: 'emitida',
    label: 'Rodaje'
  },
  POSTPRODUCCIÓN: {
    tone: 'emitida',
    label: 'Postproducción'
  },
  FINALIZADO: {
    tone: 'aprobada',
    label: 'Finalizado'
  },
  FACTURA_PENDIENTE: {
    tone: 'borrador',
    label: 'Factura pendiente'
  },
  FACTURADO: {
    tone: 'emitida',
    label: 'Facturado'
  },
  PARCIALMENTE_PAGADO: {
    tone: 'emitida',
    label: 'Parcial'
  },
  PAGADO: {
    tone: 'aprobada',
    label: 'Pagado'
  },
  VENCIDO: {
    tone: 'cancelada',
    label: 'Vencido'
  },
  PENDIENTE: {
    tone: 'borrador',
    label: 'Pendiente'
  },
  EN_PROCESO_PAGO: {
    tone: 'emitida',
    label: 'En proceso'
  },
  validado: {
    tone: 'aprobada',
    label: 'Validado'
  },
  revision: {
    tone: 'emitida',
    label: 'En revisión'
  },
  pendiente: {
    tone: 'borrador',
    label: 'Pendiente'
  },
  rechazado: {
    tone: 'cancelada',
    label: 'Rechazado'
  }
};

/* Badge para estados que no son de cotización. El design system prohíbe añadir
   tonos nuevos, así que cada estado se mapea a uno de los cuatro existentes. */
function SNBadge({
  state,
  style
}) {
  const s = SN5_STATES[state] || {
    tone: 'borrador',
    label: String(state)
  };
  return /*#__PURE__*/React.createElement(StatusBadge, {
    status: s.tone,
    style: style
  }, s.label);
}

/* Folio tipo código: el brief pide que se lea distinto al resto del texto.
   Se resuelve con la display face en tamaño pequeño y tracking abierto. */
function Folio({
  children,
  size = 13,
  color = 'var(--text-body)'
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "sn-display",
    style: {
      fontSize: size,
      letterSpacing: '0.06em',
      color,
      display: 'inline-block'
    }
  }, children);
}
function Panel({
  title,
  eyebrow,
  action,
  children,
  padding = 'var(--space-lg)',
  style,
  bodyStyle
}) {
  return /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    style: style
  }, title || action ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: '15px var(--space-lg)',
      borderBottom: '1px solid var(--border-subtle)',
      flexWrap: 'wrap',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("div", {
    className: "sn-eyebrow",
    style: {
      marginBottom: 4
    }
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-lg)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-primary)'
    }
  }, title) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      flexWrap: 'wrap'
    }
  }, action)) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      padding,
      ...bodyStyle
    }
  }, children));
}
function Metric({
  label,
  value,
  nota,
  accent = false,
  onClick
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement(Card, {
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    padding: "var(--space-lg)",
    style: {
      cursor: onClick ? 'pointer' : 'default',
      minWidth: 0,
      background: hover && onClick ? 'var(--surface-row-alt)' : 'var(--surface-card)',
      transition: 'var(--transition-control)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sn-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "sn-display",
    style: {
      fontSize: 'var(--text-h2)',
      marginTop: 10,
      color: accent ? 'var(--accent)' : 'var(--text-primary)'
    }
  }, value), nota ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, nota) : null);
}
function Field({
  label,
  value,
  children,
  span,
  nowrapLabel
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      gridColumn: span ? 'span ' + span : undefined
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sn-label",
    style: {
      marginBottom: 7,
      whiteSpace: nowrapLabel ? 'nowrap' : undefined
    }
  }, label), children || /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }, value));
}
function ProgressBar({
  value,
  height = 5,
  tone = 'var(--accent)'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-input)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: Math.max(0, Math.min(100, value)) + '%',
      height: '100%',
      background: tone,
      transition: 'width var(--dur-slow) var(--ease-standard)'
    }
  }));
}

/* Barras agrupadas. Sin librería: alturas en % dentro de un contenedor flex. */
function BarChart({
  data,
  series,
  height = 168,
  onBarClick,
  format = v => v
}) {
  const [hover, setHover] = React.useState(null);
  const max = Math.max(...data.flatMap(d => series.map(s => d[s.key]))) * 1.08;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 'var(--space-md)',
      height,
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, data.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: d.mes || i,
    onClick: () => onBarClick && onBarClick(d),
    onMouseEnter: () => setHover(i),
    onMouseLeave: () => setHover(null),
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 4,
      height: '100%',
      position: 'relative',
      cursor: onBarClick ? 'pointer' : 'default'
    }
  }, hover === i ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -4,
      left: '50%',
      transform: 'translate(-50%,-100%)',
      background: 'var(--surface-row-alt)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      padding: '7px 11px',
      whiteSpace: 'nowrap',
      boxShadow: 'var(--shadow-raised)',
      zIndex: 2
    }
  }, series.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.key,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 'var(--text-md)',
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 2,
      background: s.color,
      flex: 'none'
    }
  }), s.label, " ", format(d[s.key])))) : null, series.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.key,
    style: {
      flex: 1,
      maxWidth: 22,
      height: d[s.key] / max * 100 + '%',
      background: s.color,
      borderRadius: '4px 4px 0 0',
      opacity: hover === null || hover === i ? 1 : 0.45,
      transition: 'opacity var(--dur-fast) var(--ease-standard)'
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-md)',
      marginTop: 9
    }
  }, data.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: d.mes || i,
    style: {
      flex: 1,
      textAlign: 'center',
      fontSize: 'var(--text-xs)',
      color: hover === i ? 'var(--text-body)' : 'var(--text-faint)',
      letterSpacing: 'var(--tracking-label)',
      textTransform: 'uppercase'
    }
  }, d.mes))));
}
function Legend({
  series
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-lg)',
      flexWrap: 'wrap',
      minWidth: 0
    }
  }, series.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.key,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: 3,
      background: s.color,
      flex: 'none'
    }
  }), s.label)));
}
function Modal({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  width = 720
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 40,
      background: 'rgba(8,10,13,.72)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-2xl)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: '100%',
      maxWidth: width,
      maxHeight: '88vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-overlay)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-md)',
      padding: 'var(--space-lg)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("div", {
    className: "sn-eyebrow",
    style: {
      marginBottom: 5
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("div", {
    className: "sn-display",
    style: {
      fontSize: 'var(--text-h3)'
    }
  }, title)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    "aria-label": "Cerrar",
    style: {
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      color: 'var(--text-muted)',
      padding: 4
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-lg)',
      overflowY: 'auto'
    }
  }, children), footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: 'var(--space-lg)',
      borderTop: '1px solid var(--border-subtle)'
    }
  }, footer) : null));
}

/* Indicador de colaboración: quién más está en el documento y en qué sección. */
function Presence({
  people
}) {
  const [open, setOpen] = React.useState(false);
  if (!people || !people.length) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setOpen(!open),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: 'var(--control-height)',
      padding: '0 13px 0 9px',
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-pill)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex'
    }
  }, people.map((p, i) => /*#__PURE__*/React.createElement(Avatar, {
    key: p.initials,
    initials: p.initials,
    size: 22,
    style: {
      marginLeft: i ? -7 : 0,
      border: '2px solid var(--surface-input)'
    }
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-muted)'
    }
  }, people.length, " viendo")), open ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'calc(100% + 7px)',
      right: 0,
      zIndex: 20,
      width: 250,
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-input)',
      boxShadow: 'var(--shadow-raised)',
      padding: 7
    }
  }, people.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.initials,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      padding: '9px 11px'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    initials: p.initials,
    size: 26
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-md)',
      color: 'var(--text-body)',
      fontWeight: 'var(--weight-medium)'
    }
  }, p.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, "Editando \xB7 ", p.seccion))))) : null);
}
function Toast({
  children,
  onClose,
  link
}) {
  if (!children) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 'var(--space-xl)',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 60,
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      maxWidth: 620,
      padding: '13px 15px 13px var(--space-lg)',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-input)',
      boxShadow: 'var(--shadow-overlay)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16,
    color: "var(--sn-status-approved-fg)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }, children), link ? /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      fontSize: 'var(--text-base)',
      fontWeight: 'var(--weight-semibold)',
      whiteSpace: 'nowrap'
    }
  }, link) : null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    "aria-label": "Cerrar",
    style: {
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      color: 'var(--text-muted)',
      padding: 2
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 15
  })));
}
function Checkbox({
  checked,
  onChange,
  label
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      cursor: 'pointer',
      fontSize: 'var(--text-base)',
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: () => onChange(!checked),
    style: {
      width: 18,
      height: 18,
      flex: 'none',
      borderRadius: 5,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: checked ? 'var(--accent)' : 'var(--surface-input)',
      border: '1px solid ' + (checked ? 'var(--accent)' : 'var(--border-subtle)'),
      transition: 'var(--transition-control)'
    }
  }, checked ? /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 12,
    color: "var(--sn-orange-ink)",
    strokeWidth: 3
  }) : null), label);
}
function Placeholder({
  text
}) {
  return /*#__PURE__*/React.createElement(Card, {
    padding: "var(--space-3xl)",
    style: {
      display: 'flex',
      gap: 'var(--space-lg)',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "circle-dot",
    size: 20,
    color: "var(--text-faint)"
  }), /*#__PURE__*/React.createElement("p", {
    className: "sn-lead",
    style: {
      margin: 0,
      maxWidth: 620
    }
  }, text));
}
const SN5_SERIES = [{
  key: 'ingresos',
  label: 'Ingresos',
  color: 'var(--accent)'
}, {
  key: 'egresos',
  label: 'Egresos',
  color: 'var(--sn-texture-teal)'
}];
Object.assign(window, {
  SNBadge,
  Folio,
  Panel,
  Metric,
  Field,
  ProgressBar,
  BarChart,
  Legend,
  Modal,
  Presence,
  Toast,
  Checkbox,
  Placeholder,
  SN5_SERIES,
  SN5_STATES
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/serenata-app/parts.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.Wordmark = __ds_scope.Wordmark;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

__ds_ns.TableFooter = __ds_scope.TableFooter;

__ds_ns.FilterButton = __ds_scope.FilterButton;

__ds_ns.SearchInput = __ds_scope.SearchInput;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.TextField = __ds_scope.TextField;

__ds_ns.AppShell = __ds_scope.AppShell;

__ds_ns.SectionHero = __ds_scope.SectionHero;

__ds_ns.FilterTabs = __ds_scope.FilterTabs;

__ds_ns.NavItem = __ds_scope.NavItem;

__ds_ns.Sidebar = __ds_scope.Sidebar;

__ds_ns.Topbar = __ds_scope.Topbar;

__ds_ns.UserMenu = __ds_scope.UserMenu;

__ds_ns.SERIES_DEFAULT = __ds_scope.SERIES_DEFAULT;

__ds_ns.BarChart = __ds_scope.BarChart;

__ds_ns.ChartLegend = __ds_scope.ChartLegend;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Folio = __ds_scope.Folio;

__ds_ns.Metric = __ds_scope.Metric;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.Panel = __ds_scope.Panel;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.STATE_MAP = __ds_scope.STATE_MAP;

__ds_ns.StateBadge = __ds_scope.StateBadge;

})();
