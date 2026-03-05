from nicegui import ui
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURAZIONE ---
BACKEND_URL = os.getenv("API_URL", "http://127.0.0.1:8000")
TITLE = "CONTENTHUNTER PIM | INDUSTRIAL"
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

# --- DESIGN SYSTEM (INDUSTRIAL NEUTRAL) ---
def setup_styles():
    ui.colors(primary='#111827', secondary='#F3F4F6', accent='#6B7280')
    ui.query('body').style('background-color: #F9FAFB; color: #111827; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            .q-drawer { background: #FFFFFF !important; border-right: 1px solid #E5E7EB !important; }
            .sidebar-item { border-radius: 12px !important; margin: 4px 12px; transition: all 0.2s; font-weight: 600; color: #6B7280; font-size: 13px; }
            .sidebar-item.active { background-color: #111827 !important; color: #FFFFFF !important; }
            .group-label { font-size: 10px; font-weight: 900; color: #9CA3AF; letter-spacing: 0.2em; padding: 30px 24px 12px 24px; text-transform: uppercase; }
            .main-card { border-radius: 16px; border: 1px solid #F3F4F6; background: white; box-shadow: 0 1px 2px rgba(0,0,0,0.03); }
            .search-bar { border-radius: 14px !important; border: 1px solid #E5E7EB !important; }
            .kpi-card { border-radius: 24px; border: 1px solid #F3F4F6; background: white; height: 160px; padding: 28px; transition: transform 0.2s; }
            .kpi-card:hover { transform: translateY(-2px); border-color: #D1D5DB; }
            .kpi-icon-box { border-radius: 14px; padding: 12px; margin-bottom: 16px; display: inline-block; background: #F9FAFB; border: 1px solid #F3F4F6; }
            .status-badge { border-radius: 8px; font-size: 9px; font-weight: 900; padding: 5px 12px; background: #F3F4F6; color: #374151; border: 1px solid #E5E7EB; }
            .product-row:hover { background-color: #F9FAFB; border-color: #E5E7EB; }
        </style>
    ''')

# --- SIDEBAR ---
@ui.refreshable
def sidebar_area():
    with ui.column().classes('w-full gap-0'):
        # Brand/Logo Area
        with ui.column().classes('w-full py-12 px-8'):
            with ui.row().classes('items-center gap-4'):
                with ui.element('div').classes('w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg'):
                    ui.icon('precision_manufacturing', size='sm', color='white')
                with ui.column().classes('gap-0'):
                    ui.label('CONTENT').classes('text-sm font-black tracking-widest leading-none')
                    ui.label('HUNTER').classes('text-sm font-black tracking-widest leading-none opacity-40')

        ui.label('MAIN CORE').classes('group-label')
        sidebar_item('Dashboard', 'space_dashboard', 'dashboard')
        sidebar_item('Master ERP', 'inventory', 'products')
        
        ui.label('ANAGRAFICHE').classes('group-label')
        sidebar_item('Brand Registry', 'terminal', 'brands')
        sidebar_item('Categories Tree', 'schema', 'categories')
        
        ui.label('SYSTEM AI').classes('group-label')
        sidebar_item('Data Analytics', 'analytics', 'analytics')
        
        ui.space()
        
        # User/Profile Section
        with ui.row().classes('w-full p-8 items-center gap-4 border-t border-slate-50'):
            ui.avatar('AG').classes('bg-slate-900 text-white font-black text-xs')
            with ui.column().classes('gap-0'):
                ui.label('Augusto Genca').classes('text-xs font-black text-slate-800')
                ui.label('PRO LICENSE').classes('text-[8px] font-black text-slate-400 tracking-widest')

def sidebar_item(label: str, icon: str, page_name: str):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'w-full justify-start py-4 sidebar-item {"active" if is_active else ""}').props('flat no-caps'):
        with ui.row().classes('items-center gap-4'):
            ui.icon(icon, size='20px')
            ui.label(label)

# --- CONTENT ---
@ui.refreshable
async def content_area():
    if app_logic.loading:
        with ui.column().classes('w-full items-center justify-center p-32'):
            ui.spinner_ios(size='xl', color='primary')
            ui.label('FETCHING DATA...').classes('text-slate-300 mt-6 font-black tracking-[0.3em] text-[9px]')
        return

    page = app_logic.active_page
    with ui.column().classes('w-full p-16 gap-12 max-w-[1400px] mx-auto'):
        # Header Section
        with ui.row().classes('w-full justify-between items-end'):
            with ui.column().classes('gap-1'):
                ui.label('Industrial Data Engine').classes('text-4xl font-black text-slate-900 tracking-tighter')
                ui.label('Gestione anagrafica centralizzata e ottimizzazione AI').classes('text-slate-400 text-sm font-medium')
            
            with ui.row().classes('gap-3'):
                ui.input(placeholder='Filtra...').props('outlined dense').classes('w-48 bg-white search-bar')
                ui.button(icon='tune').props('flat round').classes('text-slate-300 bg-white border')

        if page == 'dashboard':
            # KPI Grid Industrial Style
            with ui.row().classes('w-full gap-8'):
                kpi_box('TOTAL ASSETS', '3.840', 'layers', '#111827')
                kpi_box('ACTIVE CATALOGS', '14', 'folder', '#111827')
                kpi_box('PENDING TASKS', '156', 'auto_awesome', '#111827')
                kpi_box('SYSTEM LOAD', '1.2%', 'speed', '#111827')

            # Activity Table
            with ui.column().classes('w-full main-card p-12'):
                ui.label('LOG ATTIVITÀ RECENTI').classes('text-[10px] font-black text-slate-400 tracking-[0.2em] mb-10')
                for item in app_logic.data[:6]:
                    with ui.row().classes('w-full py-6 border-b border-slate-50 items-center hover:bg-slate-50/30 px-4'):
                        with ui.column().classes('gap-0 flex-1'):
                            ui.label('LOG ENTRY #'+str(item['id'])).classes('text-[9px] font-black text-blue-600 uppercase mb-1')
                            ui.label(item['name']).classes('text-base font-black text-slate-800')
                        ui.label('SYNC: 100%').classes('text-[10px] font-bold text-slate-300')
                        ui.label('OPERATIVO').classes('status-badge ml-12')

        elif page == 'products':
            with ui.column().classes('w-full main-card p-12'):
                ui.label('MASTER PIM PRODUCTS').classes('text-[10px] font-black text-slate-400 tracking-[0.2em] mb-10')
                for p in app_logic.data:
                    with ui.row().classes('w-full py-6 border-b border-slate-50 items-center cursor-pointer product-row px-4 transition-all').on('click', lambda p=p: app_logic.open_product_detail(p['sku'])):
                        with ui.element('div').classes('w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100'):
                             ui.icon('inventory_2', size='sm', color='slate-400')
                        with ui.column().classes('flex-1 gap-1 ml-6'):
                            ui.label(p['sku']).classes('text-[10px] font-black text-blue-600')
                            ui.label(p['title']).classes('text-sm font-black text-slate-800 truncate max-w-xl')
                        ui.label(f"€ {p['price'] or 0.0:.2f}").classes('text-sm font-black text-slate-900 mr-12')
                        ui.label('VERIFICATO').classes('status-badge')

def kpi_box(label, value, icon, color):
    with ui.card().classes('kpi-card flex-1 shadow-none'):
        with ui.element('div').classes('kpi-icon-box'):
            ui.icon(icon, color=color, size='24px')
        ui.label(label).classes('text-[9px] font-black text-slate-400 tracking-widest uppercase')
        ui.label(value).classes('text-3xl font-black text-slate-900 mt-1 tracking-tighter')

@ui.refreshable
def modal_content():
    p = app_logic.selected_product
    if not p: return
    with ui.column().classes('p-16 gap-12 w-full'):
        with ui.row().classes('w-full justify-between items-start'):
            with ui.column().classes('gap-1'):
                ui.label('SKU: '+p['sku']).classes('text-[10px] font-black text-blue-600 tracking-widest')
                ui.label(p['translations'].get('it', {}).get('title', 'Prodotto')).classes('text-4xl font-black text-slate-900 tracking-tighter')
            ui.button(icon='close', on_click=app_logic.product_modal.close).props('flat round').classes('text-slate-300')
        
        with ui.grid(columns=2).classes('w-full gap-12'):
            with ui.column().classes('gap-4'):
                ui.label('MASTER DATA').classes('text-[10px] font-black text-slate-400 tracking-widest')
                ui.input('Denominazione', value=p['translations'].get('it', {}).get('title', '')).classes('w-full').props('outlined rounded-xl')
                ui.textarea('Descrizione', value=p['translations'].get('it', {}).get('description', '')).classes('w-full').props('outlined rounded-2xl h-48')
            with ui.column().classes('gap-6'):
                ui.label('SPECIFICATIONS').classes('text-[10px] font-black text-slate-400 tracking-widest')
                ui.input('Brand', value=p.get('brand')).classes('w-full').props('outlined rounded-xl')
                ui.input('MSRP Price', value=str(p.get('price'))).classes('w-full').props('outlined rounded-xl prefix="€" font-black')
        
        with ui.row().classes('w-full justify-end mt-10'):
            ui.button('CLOSE', on_click=app_logic.product_modal.close).classes('text-slate-400 font-bold px-10 py-4').props('flat no-caps')
            ui.button('UPDATE SYSTEM', icon='save').classes('bg-slate-900 text-white px-12 py-4 rounded-2xl font-black ml-4 shadow-xl').props('no-caps')

@ui.page('/')
async def main_page():
    setup_styles()
    with ui.dialog().classes('w-full max-w-6xl') as product_modal:
        app_logic.product_modal = product_modal
        with ui.card().classes('p-0 w-full rounded-[2.5rem] bg-white border-0 shadow-2xl'):
            modal_content()

    with ui.left_drawer(value=True, fixed=True).classes('p-0 shadow-none border-r'):
        sidebar_area()

    with ui.column().classes('flex-1 w-full'):
        await content_area()
        if not app_logic.data:
            await app_logic.navigate_to('dashboard')

ui.run(title=TITLE, host='0.0.0.0', port=PORT, show=False, reload=False)
