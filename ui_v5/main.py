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

# --- DESIGN SYSTEM (EXACT REPLICA) ---
def setup_styles():
    ui.colors(primary='#D32F2F', secondary='#EAD8C2', accent='#1A1A1A')
    ui.query('body').style('background-color: #F9F9F9; color: #1A1A1A; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            .q-drawer { background: #FFFFFF !important; border-right: 1px solid #ECECEC !important; }
            .sidebar-item { border-radius: 14px !important; margin: 2px 12px; transition: all 0.2s; font-weight: 600; color: #4A5568; font-size: 14px; padding: 8px 16px !important; }
            .sidebar-item.active { background-color: #EAD8C2 !important; color: #000 !important; }
            .group-label { font-size: 11px; font-weight: 800; color: #94A3B8; letter-spacing: 0.1em; padding: 25px 24px 8px 24px; text-transform: uppercase; }
            .group-label-red { font-size: 11px; font-weight: 900; color: #D32F2F; letter-spacing: 0.1em; padding: 30px 24px 10px 24px; text-transform: uppercase; }
            .version-label { font-size: 10px; font-weight: 900; color: #D32F2F; letter-spacing: 0.1em; padding: 20px 24px; text-transform: uppercase; }
            .main-card { border-radius: 16px; border: none; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
            .kpi-card { border-radius: 20px; border: none; background: white; height: 160px; padding: 25px; }
            .status-badge { border-radius: 8px; font-size: 10px; font-weight: 800; padding: 4px 10px; background: #F1F5F9; color: #475569; }
        </style>
    ''')

# --- SIDEBAR (EXACT REPLICA) ---
@ui.refreshable
def sidebar_area():
    with ui.column().classes('w-full gap-0 h-full'):
        # Logo Area (Exact size and padding)
        with ui.column().classes('items-center w-full py-12 px-6'):
            with ui.element('div').classes('w-36 h-36 bg-white flex items-center justify-center mb-0'):
                ui.icon('hub', size='4.5rem', color='primary')
            ui.label('CONTENT HUNTER').classes('text-sm font-black tracking-widest text-[#D32F2F] -mt-4')

        ui.label('MENU PRINCIPALE').classes('group-label')
        sidebar_item('Dashboard', 'space_dashboard', 'dashboard')
        sidebar_item('Master ERP', 'inventory_2', 'products')
        sidebar_item('Import Lab', 'auto_awesome', 'import')
        sidebar_item('Cataloghi', 'folder_open', 'repositories')
        
        ui.label('ANAGRAFICHE MASTER').classes('group-label-red')
        sidebar_item('Brand Library', 'branding_watermark', 'brands')
        sidebar_item('Categorie', 'account_tree', 'categories')
        
        ui.space()
        
        # Bottom Section
        ui.label('V. 5.0 [05/03/2026]').classes('version-label')
        
        with ui.row().classes('w-full px-6 py-4 items-center gap-4'):
            with ui.element('div').classes('w-10 h-10 bg-[#F1F5F9] rounded-xl flex items-center justify-center'):
                ui.label('a').classes('text-slate-400 font-bold text-lg')
            with ui.column().classes('gap-0'):
                ui.label('Administrator').classes('text-sm font-bold text-slate-800')
                ui.label('ADMIN').classes('text-[10px] font-black text-slate-400 -mt-1')
        
        with ui.button(on_click=lambda: ui.notify('Logout')).classes('w-full justify-start py-4 px-8 text-slate-400 font-bold').props('flat no-caps'):
            with ui.row().classes('items-center gap-4'):
                ui.icon('logout', size='22px')
                ui.label('ESCI')

def sidebar_item(label: str, icon: str, page_name: str):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'w-full justify-start py-3 sidebar-item {"active" if is_active else ""}').props('flat no-caps'):
        with ui.row().classes('items-center gap-4'):
            # Using outlined icons to match the image
            ui.icon(f'n-o-{icon}' if not icon.startswith('auto') else icon, size='22px')
            ui.label(label)

# --- CONTENT ---
@ui.refreshable
async def content_area():
    if app_logic.loading:
        with ui.column().classes('w-full items-center justify-center p-32'):
            ui.spinner_ios(size='xl', color='primary')
        return

    page = app_logic.active_page
    with ui.column().classes('w-full p-12 gap-10'):
        # Header (Industrial Grayscale as requested before)
        with ui.column().classes('gap-1'):
            ui.label('Industrial Data Engine').classes('text-3xl font-black text-slate-900 tracking-tighter')
            ui.label('Interrogazione dati PIM nativa PM2').classes('text-slate-400 text-sm')

        if page == 'dashboard':
            with ui.row().classes('w-full gap-8'):
                kpi('ASSETS', '3.840', 'layers', '#212121', '#F5F5F5')
                kpi('CATALOGI', '14', 'folder', '#212121', '#F5F5F5')
                kpi('IMPORT', '3', 'auto_awesome', '#212121', '#F5F5F5')
                kpi('STORAGE', '85%', 'storage', '#212121', '#F5F5F5')

            with ui.column().classes('w-full main-card p-10 mt-4'):
                ui.label('ATTIVITÀ RECENTI').classes('text-[10px] font-black text-slate-400 tracking-widest mb-6')
                for c in app_logic.data[:5]:
                    with ui.row().classes('w-full py-5 border-b border-slate-50 items-center justify-between'):
                        ui.label(c['name']).classes('font-black text-slate-800')
                        ui.label('ONLINE').classes('status-badge')

        elif page == 'products':
            with ui.column().classes('w-full main-card p-10'):
                ui.label('MASTER ERP LIBRARY').classes('text-[10px] font-black text-slate-400 tracking-widest mb-6')
                for p in app_logic.data:
                    with ui.row().classes('w-full py-4 border-b border-slate-50 items-center cursor-pointer hover:bg-slate-50 px-4').on('click', lambda p=p: app_logic.open_product_detail(p['sku'])):
                        ui.label(p['sku']).classes('text-xs font-bold text-blue-500 w-32')
                        ui.label(p['title']).classes('font-black text-slate-800 flex-1 truncate')
                        ui.label('VERIFICATO').classes('status-badge')

def kpi(label, value, icon, icon_color, icon_bg):
    with ui.card().classes('kpi-card flex-1'):
        with ui.element('div').style(f'background: {icon_bg};').classes('p-3 rounded-xl mb-4 inline-block'):
            ui.icon(icon, color=icon_color, size='24px')
        ui.label(label).classes('text-[10px] font-black text-slate-400 tracking-widest')
        ui.label(value).classes('text-2xl font-black text-slate-900 mt-1')

@ui.refreshable
def modal_content():
    p = app_logic.selected_product
    if not p: return
    with ui.column().classes('p-12 gap-8 w-full'):
        ui.label(p['sku']).classes('text-xs font-black text-blue-500 tracking-widest')
        ui.label(p['translations'].get('it', {}).get('title', 'Prodotto')).classes('text-3xl font-black')
        ui.button('CHIUDI', on_click=app_logic.product_modal.close).classes('bg-slate-900 text-white rounded-xl px-12 py-4 font-black')

@ui.page('/')
async def main_page():
    setup_styles()
    with ui.dialog().classes('w-full max-w-4xl') as product_modal:
        app_logic.product_modal = product_modal
        with ui.card().classes('p-0 w-full rounded-[2rem] bg-white border-0'):
            modal_content()

    with ui.left_drawer(value=True, fixed=True).classes('p-0'):
        sidebar_area()

    with ui.column().classes('flex-1 w-full bg-[#F9F9F9]'):
        await content_area()
        if not app_logic.data:
            await app_logic.navigate_to('dashboard')

ui.run(title=TITLE, host='0.0.0.0', port=PORT, show=False, reload=False)
