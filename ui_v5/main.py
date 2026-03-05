from nicegui import ui
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# CONFIGURAZIONE
BACKEND_URL = os.getenv("API_URL", "http://backend:8000")
TITLE = "CONTENTHUNTER PIM | ENTERPRISE"

# STILI TEMA (Bitrix24 Inspired)
def setup_styles():
    ui.colors(primary='#212121', secondary='#757575', accent='#E0E0E0', dark='#1D1D1D')
    ui.query('body').style('background-color: #F4F7F9; color: #333333; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            .sidebar-item { border-radius: 12px !important; margin: 2px 0; transition: all 0.2s; font-weight: 700 !important; }
            .sidebar-item:hover { background-color: white !important; color: #3B82F6 !important; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .sidebar-item.active { background-color: white !important; color: #000 !important; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08); border: 1px solid #E2E8F0; }
            .q-drawer { background: #EEF2F7 !important; border-right: 1px solid #DFE5ED !important; }
            .group-label { font-size: 10px; font-weight: 800; color: #94A3B8; letter-spacing: 0.15em; padding: 20px 12px 6px 12px; }
            .main-card { border-radius: 16px; border: 1px solid #E2E8F0; background: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .q-table__card { box-shadow: none !important; border: 1px solid #E2E8F0 !important; border-radius: 16px !important; }
            .q-table th { font-weight: 800 !important; color: #94A3B8 !important; text-transform: uppercase !important; font-size: 11px !important; letter-spacing: 0.05em !important; }
            /* Rimozione scrollbar sidebar */
            .q-drawer::-webkit-scrollbar { display: none; }
            .q-drawer { -ms-overflow-style: none; scrollbar-width: none; }
        </style>
    ''')

class PIMApp:
    def __init__(self):
        self.active_page = 'dashboard'
        self.data = []
        self.loading = False

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
                        self.data = raw_data.get('products', raw_data) if page_name == 'products' else raw_data
            except Exception as e:
                ui.notify(f"Errore DB: {str(e)}", type='negative')
                self.data = []
        
        self.loading = False
        content_area.refresh()

app_logic = PIMApp()

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
        sidebar_item('Tags', 'sell', 'tags')
        
        ui.label('DISTRIBUTION').classes('group-label')
        sidebar_item('Excel Export', 'sim_card_download', 'export')
        sidebar_item('Omnichannel', 'public', 'omni')

def sidebar_item(label: str, icon: str, page_name: str, badge: str = None):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'w-full justify-start py-2.5 px-4 sidebar-item {"active" if is_active else "text-slate-500"}').props('flat no-caps'):
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
            ui.label('ACCESSO AL DATABASE...').classes('text-slate-400 mt-4 font-black uppercase tracking-[0.2em] text-[10px]')
        return

    page = app_logic.active_page
    
    # BOX CENTRALE LIMITATO (Stile vecchia versione)
    with ui.column().classes('max-w-7xl mx-auto w-full px-10 py-10 gap-8'):
        if page == 'dashboard':
            with ui.row().classes('w-full justify-between items-center mb-4'):
                with ui.column().classes('gap-1'):
                    ui.label('Dashboard Repository').classes('text-3xl font-black text-slate-900 tracking-tight')
                    ui.label('Sincronizzazione Cataloghi e Staging Lab.').classes('text-slate-400 text-sm font-medium')
                ui.button('NUOVO CATALOGO', icon='add').classes('rounded-xl px-8 py-4 bg-slate-900 text-white font-black text-xs shadow-lg').props('no-caps')
            
            with ui.grid(columns=3).classes('w-full gap-6'):
                if app_logic.data:
                    for c in app_logic.data:
                        with ui.card().classes('main-card p-6 gap-4 hover:border-blue-500 transition-all cursor-pointer'):
                            with ui.row().classes('w-full justify-between items-start'):
                                ui.avatar('folder', color='blue-50', text_color='blue-600').classes('rounded-xl')
                                ui.badge(c.get('status', 'STAGING').upper()).props('outline color=blue-4')
                            ui.label(c['name']).classes('text-lg font-black text-slate-800 tracking-tight')
                            ui.label(f"Prodotti: {c.get('product_count', 0)}").classes('text-xs text-slate-400 font-bold')
                            ui.button('GESTISCI', color='primary', on_click=lambda: ui.notify('Apertura catalogo')).classes('w-full rounded-xl mt-2 font-black py-2 text-xs').props('no-caps')
                else:
                    ui.label('Caricamento cataloghi...').classes('text-slate-400 italic')

        elif page == 'products':
            ui.label('Master ERP Inventory').classes('text-3xl font-black text-slate-900 tracking-tight mb-8')
            columns = [
                {'name': 'sku', 'label': 'SKU CODE', 'field': 'sku', 'align': 'left', 'sortable': True},
                {'name': 'title', 'label': 'PRODUCT NAME', 'field': 'title', 'align': 'left', 'sortable': True},
                {'name': 'brand', 'label': 'BRAND', 'field': 'brand', 'align': 'left', 'sortable': True},
                {'name': 'price', 'label': 'MSRP PRICE', 'field': 'price', 'align': 'right', 'sortable': True},
            ]
            ui.table(columns=columns, rows=app_logic.data, row_key='sku').classes('w-full main-card bg-white p-4')

@ui.page('/')
async def main_page():
    setup_styles()
    
    # HEADER
    with ui.header().classes('bg-white/80 backdrop-blur-md text-slate-800 border-b border-slate-200 px-10 py-3 flex justify-between items-center z-10'):
        ui.label('INDUSTRIAL DATA ENGINE V5').classes('text-[9px] font-black opacity-30 uppercase tracking-[0.3em]')
        with ui.row().classes('items-center gap-6'):
            ui.avatar('AG').classes('text-[10px] bg-slate-900 text-white font-black shadow-md border-2 border-slate-100')

    # SIDEBAR (Senza Scroll, compatta)
    with ui.left_drawer(value=True, fixed=True).classes('p-6 flex flex-col gap-0 shadow-sm overflow-hidden'):
        with ui.row().classes('items-center gap-4 mb-8 px-2'):
            with ui.element('div').classes('w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center font-black text-white shadow-lg'):
                ui.label('CH').classes('text-xs')
            with ui.column().classes('gap-0'):
                ui.label('ContentHunter').classes('text-lg font-black tracking-tighter text-slate-900 leading-none')
                ui.label('PIM SYSTEM V.5').classes('text-[8px] font-bold text-blue-500 mt-1 tracking-[0.2em] uppercase')
            
        # Menu Area (Senza ScrollArea per allungarlo)
        sidebar_area()

        ui.space()
        # AI Card Sottile in fondo
        with ui.card().classes('bg-slate-900 p-4 rounded-2xl mb-4 cursor-pointer hover:bg-slate-800 transition-all'):
            with ui.row().classes('items-center gap-3'):
                ui.avatar('memory', color='white', text_color='slate-900').classes('rounded-lg shadow-sm')
                with ui.column().classes('gap-0'):
                    ui.label('AI Hub').classes('text-[11px] font-black text-white')
                    ui.label('GPT-4o Ready').classes('text-[8px] font-bold text-blue-400 uppercase tracking-widest')

    # MAIN CONTAINER (Centrato)
    with ui.column().classes('flex-1 w-full bg-[#F4F7F9] min-h-screen'):
        await content_area()
        if not app_logic.data and not app_logic.loading:
            await app_logic.navigate_to('dashboard')

ui.run(title=TITLE, port=3001)
