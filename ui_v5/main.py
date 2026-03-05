from nicegui import ui
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURAZIONE ---
BACKEND_URL = os.getenv("API_URL", "http://backend:8000")
TITLE = "CONTENTHUNTER PIM | ENTERPRISE"
PORT = 3001

# --- DESIGN SYSTEM ---
def setup_styles():
    ui.colors(primary='#212121', secondary='#757575', accent='#3B82F6', dark='#1D1D1D')
    ui.query('body').style('background-color: #F4F7F9; color: #333333; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            .sidebar-item { border-radius: 12px !important; margin: 4px 0; transition: all 0.2s; font-weight: 700 !important; }
            .sidebar-item:hover { background-color: white !important; color: #3B82F6 !important; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .sidebar-item.active { background-color: white !important; color: #000 !important; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08); border: 1px solid #E2E8F0; }
            .q-drawer { background: #EEF2F7 !important; border-right: 1px solid #DFE5ED !important; }
            .group-label { font-size: 10px; font-weight: 800; color: #94A3B8; letter-spacing: 0.15em; padding: 24px 12px 10px 12px; }
            .main-card { border-radius: 20px; border: 1px solid #E2E8F0; background: white; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.03); overflow: hidden; }
            .product-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; border: 1px solid #E2E8F0; }
            .product-card:hover { transform: translateY(-4px); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); border-color: #3B82F6; }
            .badge-red { background: #FF5752; color: white; border-radius: 6px; padding: 2px 6px; font-size: 9px; font-weight: 900; }
        </style>
    ''')

# --- LOGICA ---
class PIMApp:
    def __init__(self):
        self.active_page = 'dashboard'
        self.data = []
        self.loading = False
        self.selected_product = None
        self.product_detail_loading = False

    async def navigate_to(self, page_name: str):
        self.active_page = page_name
        self.loading = True
        self.selected_product = None
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
                        self.data = raw_data.get('products', raw_data) if page_name == 'products' else raw_data
            except Exception as e:
                ui.notify(f"Errore DB: {str(e)}", type='negative')
                self.data = []
        
        self.loading = False
        content_area.refresh()

    async def open_product_detail(self, sku: str):
        self.product_detail_loading = True
        product_modal.open()
        modal_content.refresh()
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{BACKEND_URL}/api/v5/products/{sku}", timeout=10)
                if resp.status_code == 200:
                    self.selected_product = resp.json()
                else:
                    ui.notify("Prodotto non trovato", type='negative')
                    product_modal.close()
        except Exception as e:
            ui.notify(f"Errore: {str(e)}", type='negative')
            product_modal.close()
        self.product_detail_loading = False
        modal_content.refresh()

app_logic = PIMApp()

# --- UI ---
@ui.refreshable
def sidebar_area():
    with ui.column().classes('w-full gap-0'):
        ui.label('CORE PIM').classes('group-label')
        sidebar_item('Dash Cataloghi', 'dashboard', 'dashboard')
        sidebar_item('Master ERP', 'database', 'products')
        sidebar_item('Import Lab', 'file_download', 'import', badge='AI')
        
        ui.label('ANAGRAFICHE MASTER').classes('group-label')
        sidebar_item('Brand', 'branding_watermark', 'brands')
        sidebar_item('Categorie', 'layers', 'categories')
        sidebar_item('Bullet Points', 'list', 'bullets')

def sidebar_item(label: str, icon: str, page_name: str, badge: str = None):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'w-full justify-start py-3 px-4 sidebar-item {"active" if is_active else "text-slate-500"}').props('flat no-caps'):
        with ui.row().classes('items-center gap-3 w-full'):
            ui.icon(icon).classes('text-lg opacity-70')
            ui.label(label).classes('text-[13px] tracking-tight')
            if badge:
                ui.space()
                with ui.element('span').classes('badge-red'):
                    ui.label(badge)

@ui.refreshable
async def content_area():
    if app_logic.loading:
        with ui.column().classes('w-full items-center justify-center p-20'):
            ui.spinner_ios(size='lg', color='primary')
            ui.label('SINCRONIZZAZIONE...').classes('text-slate-400 mt-4 font-black uppercase tracking-[0.2em] text-[10px]')
        return

    page = app_logic.active_page
    with ui.column().classes('max-w-7xl mx-auto w-full px-10 py-10 gap-8'):
        if page == 'dashboard':
            with ui.row().classes('w-full justify-between items-center mb-4'):
                with ui.column().classes('gap-1'):
                    ui.label('Dashboard Repository').classes('text-3xl font-black text-slate-900 tracking-tight')
                    ui.label('Collezioni e canali di importazione PDF.').classes('text-slate-400 text-sm font-medium')
                ui.button('NUOVO CATALOGO', icon='add').classes('rounded-xl px-8 py-4 bg-slate-900 text-white font-black text-xs shadow-lg').props('no-caps')
            with ui.grid(columns=3).classes('w-full gap-6'):
                for c in app_logic.data:
                    with ui.card().classes('main-card p-6 gap-4 product-card'):
                        ui.label(c['name']).classes('text-lg font-black text-slate-800 tracking-tight')
                        ui.label(f"Importati: {c.get('product_count', 0)}").classes('text-xs text-slate-400 font-bold')

        elif page == 'products':
            ui.label('Master ERP Library').classes('text-3xl font-black text-slate-900 tracking-tight mb-8')
            with ui.column().classes('w-full gap-4'):
                if not app_logic.data:
                    ui.label('Nessun prodotto trovato.').classes('text-slate-400 italic py-10 text-center w-full')
                else:
                    for p in app_logic.data:
                        with ui.card().classes('main-card p-4 product-card hover:border-blue-500').on('click', lambda p=p: app_logic.open_product_detail(p['sku'])):
                            with ui.row().classes('items-center w-full gap-6'):
                                with ui.element('div').classes('w-16 h-16 bg-slate-50 rounded-xl flex items-center justify-center border'):
                                    ui.icon('inventory_2', size='md').classes('text-slate-200')
                                with ui.column().classes('flex-1 gap-1'):
                                    ui.label(p['sku']).classes('text-[10px] font-black text-blue-500 tracking-widest uppercase')
                                    ui.label(p['title']).classes('text-sm font-black text-slate-900 truncate max-w-lg')
                                with ui.column().classes('items-end gap-1'):
                                    ui.label(f"€ {p['price'] or 0.0:.2f}").classes('text-lg font-black text-slate-900')
                                ui.icon('chevron_right').classes('text-slate-300 ml-4')

@ui.refreshable
def modal_content():
    if app_logic.product_detail_loading:
        with ui.column().classes('w-full h-[400px] items-center justify-center'):
            ui.spinner_ios(size='lg', color='primary')
        return
    p = app_logic.selected_product
    if not p: return
    with ui.column().classes('w-full p-10 gap-6'):
        ui.label(f"SKU: {p['sku']}").classes('text-xs font-black text-blue-500')
        ui.label(p['translations'].get('it', {}).get('title', 'Untitled')).classes('text-2xl font-black text-slate-900')
        ui.textarea('Descrizione', value=p['translations'].get('it', {}).get('description', '')).classes('w-full').props('outlined rounded')
        ui.button('CHIUDI', on_click=product_modal.close).classes('mt-4 bg-slate-900 text-white rounded-xl px-10 py-3')

with ui.dialog().classes('w-full max-w-[1200px]') as product_modal:
    with ui.card().classes('p-0 w-full overflow-hidden rounded-[2.5rem] bg-white'):
        modal_content()

@ui.page('/')
async def main_page():
    setup_styles()
    with ui.header().classes('bg-white/80 backdrop-blur-md text-slate-800 border-b border-slate-200 px-10 py-3 flex justify-between items-center z-10'):
        ui.label('CONTENTHUNTER PIM V5').classes('text-[9px] font-black tracking-[0.3em]')
        ui.avatar('AG').classes('bg-slate-900 text-white shadow-md border-2 border-slate-100 font-black')

    with ui.left_drawer(value=True, fixed=True).classes('p-6 flex flex-col gap-0 shadow-sm'):
        ui.label('ContentHunter').classes('text-xl font-black mb-10 px-2')
        sidebar_area()

    with ui.column().classes('flex-1 w-full bg-[#F4F7F9] min-h-screen'):
        await content_area()
        if not app_logic.data and not app_logic.loading:
            await app_logic.navigate_to('dashboard')

ui.run(title=TITLE, host='0.0.0.0', port=PORT, show=False, reload=False)
