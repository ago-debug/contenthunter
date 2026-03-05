from nicegui import ui
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURAZIONE ---
BACKEND_URL = os.getenv("API_URL", "http://127.0.0.1:8000")
TITLE = "CONTENTHUNTER PIM | ENTERPRISE"
PORT = 3001

# --- LOGICA ---
class PIMApp:
    def __init__(self):
        self.active_page = 'dashboard'
        self.data = []
        self.loading = False
        self.selected_product = None
        self.product_detail_loading = False
        self.product_modal = None

    async def navigate_to(self, page_name: str):
        self.active_page = page_name
        self.loading = True
        sidebar_area.refresh()
        content_area.refresh()
        
        endpoint_map = {
            'dashboard': '/api/v5/repositories',
            'products': '/api/v5/products',
            'brands': '/api/v5/brands',
            'categories': '/api/v5/categories',
        }
        
        endpoint = endpoint_map.get(page_name)
        if endpoint:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(f"{BACKEND_URL}{endpoint}", timeout=10)
                    if resp.status_code == 200:
                        raw_data = resp.json()
                        self.data = raw_data.get('products', raw_data) if 'products' in raw_data else raw_data
            except Exception:
                self.data = []
        
        self.loading = False
        content_area.refresh()

    async def open_product_detail(self, sku: str):
        self.product_detail_loading = True
        if self.product_modal:
            self.product_modal.open()
            modal_content.refresh()
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{BACKEND_URL}/api/v5/products/{sku}", timeout=10)
                if resp.status_code == 200:
                    self.selected_product = resp.json()
        except: pass
        self.product_detail_loading = False
        modal_content.refresh()

app_logic = PIMApp()

# --- DESIGN SYSTEM (NEW STYLE) ---
def setup_styles():
    ui.colors(primary='#D32F2F', secondary='#EAD8C2', accent='#1A1A1A')
    ui.query('body').style('background-color: #F8F9FA; color: #1A1A1A; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            .q-drawer { background: #FFFFFF !important; border-right: none !important; }
            .sidebar-item { border-radius: 0 12px 12px 0 !important; margin: 2px 0; margin-right: 15px; transition: all 0.2s; font-weight: 600; color: #666; font-size: 13px; }
            .sidebar-item.active { background-color: #EAD8C2 !important; color: #000 !important; }
            .group-label { font-size: 11px; font-weight: 800; color: #D32F2F; letter-spacing: 0.1em; padding: 25px 20px 10px 20px; text-transform: uppercase; }
            .main-card { border-radius: 16px; border: none; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
            .search-bar { border-radius: 12px !important; background: white !important; }
            .kpi-card { border-radius: 20px; border: none; background: white; height: 160px; display: flex; flex-direction: column; justify-content: center; padding: 25px; }
            .kpi-icon { border-radius: 12px; padding: 10px; margin-bottom: 15px; display: inline-block; }
            .status-badge { border-radius: 8px; font-size: 10px; font-weight: 800; padding: 4px 10px; background: #F1F5F9; color: #475569; }
        </style>
    ''')

# --- SIDEBAR ---
@ui.refreshable
def sidebar_area():
    with ui.column().classes('w-full gap-0'):
        # Logo Area
        with ui.column().classes('items-center w-full py-10 px-6'):
            with ui.element('div').classes('w-32 h-32 bg-slate-50 rounded-2xl flex items-center justify-center mb-4'):
                ui.icon('hub', size='4rem', color='primary')
            ui.label('CONTENT HUNTER').classes('text-sm font-black tracking-widest text-slate-900')

        ui.label('MENU PRINCIPALE').classes('group-label')
        sidebar_item('Dashboard', 'dashboard', 'dashboard')
        sidebar_item('Master ERP', 'database', 'products')
        
        ui.label('ANAGRAFICHE MASTER').classes('group-label')
        sidebar_item('Brand Library', 'branding_watermark', 'brands')
        sidebar_item('Categorie', 'account_tree', 'categories')
        
        ui.label('CONTABILITÀ AI').classes('group-label')
        sidebar_item('Analisi Costi', 'query_stats', 'analytics')
        
        ui.space()
        
        # User Profile
        with ui.row().classes('w-full p-6 items-center gap-4 border-t border-slate-50'):
            ui.avatar('AG').classes('bg-slate-100 text-slate-400 font-bold')
            with ui.column().classes('gap-0'):
                ui.label('Augusto Genca').classes('text-xs font-black text-slate-900')
                ui.label('Administrator').classes('text-[10px] text-slate-400')

def sidebar_item(label: str, icon: str, page_name: str):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'w-full justify-start py-3 px-6 sidebar-item {"active" if is_active else ""}').props('flat no-caps'):
        with ui.row().classes('items-center gap-4'):
            ui.icon(icon, size='18px')
            ui.label(label)

# --- CONTENT ---
@ui.refreshable
async def content_area():
    page = app_logic.active_page
    with ui.column().classes('w-full p-12 gap-10'):
        # Top Header
        with ui.column().classes('gap-1'):
            ui.label('Sistema di Gestione Cataloghi').classes('text-3xl font-black text-slate-900 tracking-tight')
            ui.label('Gestione centralizzata e interrogazione dati PIM').classes('text-slate-400 text-sm')

        # Search Bar Area
        with ui.row().classes('w-full gap-4 items-center'):
            ui.input(placeholder='Cerca prodotto, SKU o brand...').props('outlined rounded-xl bg-white').classes('flex-1 search-bar h-14')
            with ui.row().classes('gap-2'):
                ui.button('Prodotti', icon='inventory').classes('main-card px-6 py-2 h-14 text-slate-600').props('flat no-caps')
                ui.button('Cataloghi', icon='folder').classes('main-card px-6 py-2 h-14 text-slate-600').props('flat no-caps')

        if page == 'dashboard':
            # KPI Cards
            with ui.row().classes('w-full gap-6'):
                kpi('CATALOGHI ATTIVI', '12', 'folder', '#D32F2F', '#FFEBEE')
                kpi('PRODOTTI TOTALI', '3.420', 'inventory_2', '#1976D2', '#E3F2FD')
                kpi('IMPORTAZIONI OGGI', '3', 'auto_awesome', '#388E3C', '#E8F5E9')
                kpi('PENDENTI AI', '€450', 'schedule', '#FBC02D', '#FFFDE7')

            # Recent Table Layer
            with ui.column().classes('w-full main-card p-10 mt-4'):
                ui.label('ATTIVITÀ RECENTI').classes('text-sm font-black text-slate-900 mb-6')
                if not app_logic.data:
                    ui.label('Nessuna attività registrata.').classes('text-slate-400 italic')
                else:
                    for c in app_logic.data[:5]:
                        with ui.row().classes('w-full py-4 border-b border-slate-50 items-center justify-between'):
                            with ui.column().classes('gap-0'):
                                ui.label('28/03/2026').classes('text-[10px] font-bold text-blue-500')
                                ui.label(c['name']).classes('font-black text-slate-800')
                            ui.label('IMPORTAZIONE PDF').classes('text-[11px] font-bold text-slate-400')
                            ui.label('COMPLETATO').classes('status-badge')

        elif page == 'products':
            with ui.grid(columns=2).classes('w-full gap-6'):
                with ui.column().classes('w-full main-card p-10'):
                    ui.label('LISTA PRODOTTI ERP').classes('text-sm font-black text-slate-900 mb-6')
                    for p in app_logic.data:
                        with ui.row().classes('w-full py-4 border-b border-slate-50 items-center cursor-pointer hover:bg-slate-50').on('click', lambda p=p: app_logic.open_product_detail(p['sku'])):
                            with ui.column().classes('gap-0 flex-1'):
                                ui.label(p['sku']).classes('text-[10px] font-bold text-blue-500')
                                ui.label(p['title']).classes('font-black text-slate-800 truncate')
                            ui.label('PRONTO').classes('status-badge')

def kpi(label, value, icon, icon_color, icon_bg):
    with ui.card().classes('kpi-card flex-1'):
        with ui.element('div').style(f'background: {icon_bg};').classes('kpi-icon'):
            ui.icon(icon, color=icon_color, size='24px')
        ui.label(label).classes('text-[10px] font-black text-slate-400 tracking-widest')
        ui.label(value).classes('text-2xl font-black text-slate-900 mt-1')

@ui.refreshable
def modal_content():
    p = app_logic.selected_product
    if not p: return
    with ui.column().classes('p-12 gap-8 w-full'):
        ui.label(p['sku']).classes('text-xs font-black text-blue-500 tracking-widest')
        ui.label(p['translations'].get('it', {}).get('title', 'Untitled')).classes('text-3xl font-black')
        ui.textarea('Descrizione', value=p['translations'].get('it', {}).get('description', '')).classes('w-full').props('outlined rounded-2xl')
        ui.button('CHIUDI', on_click=app_logic.product_modal.close).classes('bg-slate-900 text-white rounded-xl px-12 py-4 font-black')

@ui.page('/')
async def main_page():
    setup_styles()
    with ui.dialog().classes('w-full max-w-4xl') as product_modal:
        app_logic.product_modal = product_modal
        with ui.card().classes('p-0 w-full rounded-[2rem] bg-white border-0'):
            modal_content()

    with ui.left_drawer(value=True, fixed=True).classes('shadow-none border-0'):
        sidebar_area()

    with ui.column().classes('flex-1 w-full'):
        await content_area()
        if not app_logic.data:
            await app_logic.navigate_to('dashboard')

ui.run(title=TITLE, host='0.0.0.0', port=PORT, show=False, reload=False)
