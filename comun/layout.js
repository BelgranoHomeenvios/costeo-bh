/* Layout de Belgrano Cost — se monta recién con sesión iniciada.
   Mismo lenguaje visual que Belgrano Soft: header oscuro, marca,
   solapas tipo pill, usuario con rol, Configuración y Salir. */
const LAYOUT = `<div class="app">
  <header class="bcost-header">
    <div class="bh-badge">BH</div>
    <button class="bh-marca" onclick="Router.inicio()" title="Volver a elegir módulo">Belgrano Cost</button>
    <nav class="bh-pills" id="bhPills"></nav>
    <div class="bh-spacer"></div>
    <div class="bh-user">
      <div class="bh-user-nombre" id="topUser">—</div>
      <div class="bh-user-rol">Dirección</div>
    </div>
    <div class="bh-avatar" id="topAvatar">BH</div>
    <button class="bh-btn" id="btnConfig" onclick="Router.irAConfig()">Configuración</button>
    <button class="bh-btn" onclick="Acceso.salir()">Salir</button>
  </header>
  <div class="bcost-body">
    <aside class="sidebar">
      <div class="modulo-cabecera" id="moduloCabecera"></div>
      <nav class="nav" id="nav"></nav>
      <div class="side-foot" id="sideFoot"></div>
    </aside>
    <main class="content" id="view"></main>
  </div>
</div>
<div class="scrim" id="scrim" onclick="UI.closeAll()"></div>
<div class="drawer" id="drawer"></div>
<div class="modal" id="modal"></div>
<div class="toasts" id="toasts"></div>`;
