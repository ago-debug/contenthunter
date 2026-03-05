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
        self.active_tab = 'base'

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
        self.active_tab = 'base'
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

# --- DESIGN SYSTEM ---
def setup_styles():
    ui.colors(primary='#D32F2F', secondary='#EAD8C2', accent='#1A1A1A')
    ui.query('body').style('background-color: #F8F9FA; color: #1E293B; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            .q-drawer { background: #FFFFFF !important; border-right: 1px solid #F1F5F9 !important; }
            .sidebar-item { border-radius: 0 12px 12px 0 !important; margin: 2px 0; margin-right: 15px; transition: all 0.2s; font-weight: 700; color: #64748B; font-size: 13px; }
            .sidebar-item.active { background-color: #EAD8C2 !important; color: #000 !important; }
            .group-label { font-size: 10px; font-weight: 900; color: #D32F2F; letter-spacing: 0.1em; padding: 25px 20px 10px 20px; text-transform: uppercase; }
            .main-card { border-radius: 20px; border: none; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
            .search-input { border-radius: 12px !important; }
            .kpi-card { border-radius: 24px; border: none; background: white; height: 160px; padding: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
            .status-badge { border-radius: 8px; font-size: 9px; font-weight: 900; padding: 4px 10px; background: #F1F5F9; color: #64748B; text-transform: uppercase; }
            .status-badge.ready { background: #E8F5E9; color: #2E7D32; }
            .tab-btn-mini { font-size: 10px; font-weight: 900; letter-spacing: 0.05em; border-radius: 8px; }
            .tab-btn-mini.active { background: #EAD8C2; color: black; }
        </style>
    ''')

# --- SIDEBAR ---
@ui.refreshable
def sidebar_area():
    with ui.column().classes('w-full gap-0'):
        with ui.column().classes('items-center w-full py-12 px-6'):
            with ui.element('div').classes('w-28 h-28 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 shadow-sm'):
                ui.icon('hub', size='3.5rem', color='primary')
            ui.label('CONTENT HUNTER').classes('text-sm font-black tracking-[0.2em] text-slate-900')
            ui.label('PIM V5 SYSTEM').classes('text-[8px] font-black text-slate-300 tracking-[0.3em]')

        ui.label('NAVIGAZIONE').classes('group-label')
        sidebar_item('Dashboard', 'dashboard', 'dashboard')
        sidebar_item('Master ERP', 'database', 'products')
        
        ui.label('ANAGRAFICHE MASTER').classes('group-label')
        sidebar_item('Brand Library', 'branding_watermark', 'brands')
        sidebar_item('Categorie', 'account_tree', 'categories')
        
        ui.label('SISTEMA').classes('group-label')
        sidebar_item('AI Analysis', 'auto_awesome', 'ai_lab')
        
        ui.space()
        
        with ui.row().classes('w-full p-8 items-center gap-4 border-t border-slate-50'):
            ui.avatar('AG').classes('bg-slate-100 text-slate-400 font-black text-xs shadow-sm')
            with ui.column().classes('gap-0'):
                ui.label('Augusto Genca').classes('text-xs font-black text-slate-900')
                ui.label('Administrator').classes('text-[9px] font-bold text-slate-400 uppercase tracking-tighter')

def sidebar_item(label: str, icon: str, page_name: str):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'w-full justify-start py-4 px-8 sidebar-item {"active" if is_active else ""}').props('flat no-caps'):
        with ui.row().classes('items-center gap-4'):
            ui.icon(icon, size='20px', color='primary' if is_active else 'slate-400')
            ui.label(label)

# --- CONTENT ---
@ui.refreshable
async def content_area():
    if app_logic.loading:
        with ui.column().classes('w-full items-center justify-center p-32'):
            ui.spinner_ios(size='xl', color='primary')
            ui.label('ACCESSO AI DATI...').classes('text-slate-300 mt-6 font-black tracking-widest text-[10px]')
        return

    page = app_logic.active_page
    with ui.column().classes('w-full p-16 gap-12'):
        # Page Title
        with ui.column().classes('gap-1'):
            title_map = {'dashboard': 'Sistema Gestione Cataloghi', 'products': 'Master ERP Library', 'brands': 'Brand Registry', 'categories': 'Category Manager'}
            ui.label(title_map.get(page, 'Control Center')).classes('text-4xl font-black text-slate-900 tracking-tighter')
            ui.label('Dashboard di controllo e interrogazione dati centralizzata').classes('text-slate-400 text-sm font-medium')

        # Top Bar (Search + Tabs Style)
        with ui.row().classes('w-full gap-4 items-center'):
            ui.input(placeholder='Cerca nel sistema...').props('outlined dense bg-white').classes('flex-1 main-card px-4 h-14 search-input')
            with ui.row().classes('main-card p-1 h-14 bg-white items-center gap-1 px-1'):
                tab_mini('TUTTI', True)
                tab_mini('ATTIVI', False)
                tab_mini('DRAFT', False)

        if page == 'dashboard':
            with ui.row().classes('w-full gap-8'):
                kpi_card('PRODOTTI', '3.840', 'inventory_2', '#D32F2F', '#FFEBEE')
                kpi_card('CATALOGHI', '14', 'folder_open', '#1976D2', '#E3F2FD')
                kpi_card('BRAND', '42', 'branding_watermark', '#388E3C', '#E8F5E9')
                kpi_card('AI TASKS', '156', 'auto_awesome', '#FBC02D', '#FFFDE7')

            with ui.column().classes('w-full main-card p-12 mt-4'):
                ui.label('ATTIVITÀ RECENTI NEL DATABASE').classes('text-[10px] font-black text-slate-400 tracking-widest mb-8')
                for item in app_logic.data[:6]:
                    with ui.row().classes('w-full py-6 border-b border-slate-50 items-center hover:bg-slate-50/50 px-4'):
                        with ui.column().classes('gap-0 flex-1'):
                            ui.label('OGGI, 12:45').classes('text-[9px] font-black text-blue-500 uppercase')
                            ui.label(item['name']).classes('text-base font-black text-slate-800')
                        ui.label('PDF IMPORT').classes('text-[10px] font-bold text-slate-300 uppercase tracking-widest')
                        ui.label('COMPLETATO').classes('status-badge ready ml-10')

        elif page == 'products':
            with ui.column().classes('w-full main-card p-10'):
                with ui.row().classes('w-full mb-8 border-b border-slate-50 pb-6 justify-between items-center'):
                    ui.label('ELENCO PRODOTTI ERP').classes('text-[11px] font-black text-slate-400 tracking-widest')
                    ui.button('EXPORT CSV', icon='file_download').props('flat no-caps').classes('text-xs font-black text-blue-500')
                
                for p in app_logic.data:
                    with ui.row().classes('w-full py-5 border-b border-slate-50 items-center cursor-pointer hover:bg-slate-50 px-4 transition-all').on('click', lambda p=p: app_logic.open_product_detail(p['sku'])):
                        with ui.element('div').classes('w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100'):
                             ui.icon('inventory_2', size='sm', color='slate-300')
                        with ui.column().classes('flex-1 gap-1 ml-6'):
                            ui.label(p['sku']).classes('text-[9px] font-black text-blue-500 uppercase')
                            ui.label(p['title']).classes('text-sm font-black text-slate-800 truncate max-w-xl')
                        ui.label(f"€ {p['price'] or 0.0:.2f}").classes('text-base font-black text-slate-900 mr-10')
                        ui.label('VALIDATO').classes('status-badge ready')

def kpi_card(label, value, icon, color, bg):
    with ui.card().classes('kpi-card flex-1 shadow-sm'):
        with ui.element('div').style(f'background: {bg};').classes('p-3 rounded-2xl mb-4 inline-block'):
            ui.icon(icon, color=color, size='24px')
        ui.label(label).classes('text-[9px] font-black text-slate-400 tracking-widest uppercase')
        ui.label(value).classes('text-3xl font-black text-slate-900 mt-1 tracking-tighter')

def tab_mini(label, active):
    ui.button(label).classes(f'tab-btn-mini px-5 py-2 {"active" if active else "text-slate-400"}').props('flat no-caps')

@ui.refreshable
def modal_content():
    p = app_logic.selected_product
    if not p: return
    with ui.column().classes('p-12 gap-10 w-full'):
        with ui.row().classes('w-full justify-between items-start'):
            with ui.column().classes('gap-1'):
                ui.label(p['sku']).classes('text-[11px] font-black text-blue-500 tracking-widest')
                ui.label(p['translations'].get('it', {}).get('title', 'Prodotto')).classes('text-4xl font-black text-slate-900 tracking-tighter')
            ui.button(icon='close', on_click=app_logic.product_modal.close).props('flat round').classes('text-slate-300')
        
        with ui.grid(columns=2).classes('w-full gap-10 mt-4'):
            with ui.column().classes('gap-4'):
                ui.label('DESCRIZIONE COMMERCIALE').classes('text-[10px] font-black text-slate-400 tracking-widest')
                ui.textarea(value=p['translations'].get('it', {}).get('description', '')).classes('w-full').props('outlined rounded-2xl h-48')
            with ui.column().classes('gap-6'):
                ui.label('DATI TECNICI').classes('text-[10px] font-black text-slate-400 tracking-widest')
                ui.input('Brand', value=p.get('brand')).classes('w-full').props('outlined rounded-xl')
                ui.input('Price MSRP', value=str(p.get('price'))).classes('w-full').props('outlined rounded-xl prefix="€"')
        
        with ui.row().classes('w-full justify-end mt-6'):
            ui.button('CHIUDI SCHEDA', on_click=app_logic.product_modal.close).classes('bg-slate-100 text-slate-400 px-8 py-4 rounded-2xl font-black').props('flat no-caps')
            ui.button('SALVA DATI', icon='save').classes('bg-slate-900 text-white px-12 py-4 rounded-2xl font-black ml-4 shadow-xl').props('no-caps')

@ui.page('/')
async def main_page():
    setup_styles()
    with ui.dialog().classes('w-full max-w-5xl') as product_modal:
        app_logic.product_modal = product_modal
        with ui.card().classes('p-0 w-full rounded-[3rem] bg-white border-0 shadow-2xl'):
            modal_content()

    with ui.left_drawer(value=True, fixed=True).classes('p-0'):
        sidebar_area()

    with ui.column().classes('flex-1 w-full bg-[#F8F9FA]'):
        await content_area()
        if not app_logic.data:
            await app_logic.navigate_to('dashboard')

ui.run(title=TITLE, host='0.0.0.0', port=PORT, show=False, reload=False)
