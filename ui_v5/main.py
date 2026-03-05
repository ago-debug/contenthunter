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
            .sidebar-item { border-radius: 10px !important; margin: 1px 0; transition: all 0.2s; font-weight: 600 !important; }
            .sidebar-item:hover { background-color: rgba(0,0,0,0.03) !important; color: #000 !important; }
            .sidebar-item.active { background-color: white !important; color: #000 !important; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #E2E8F0; }
            .q-drawer { background: #EEF2F7 !important; border-right: 1px solid #DFE5ED !important; }
            .group-label { font-size: 10px; font-weight: 800; color: #94A3B8; letter-spacing: 0.15em; padding: 20px 12px 8px 12px; }
            .main-card { border-radius: 20px; border: 1px solid #E2E8F0; background: white; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.03); }
            .badge-red { background: #FF5752; color: white; border-radius: 6px; padding: 2px 6px; font-size: 9px; font-weight: 900; }
            .q-table__card { box-shadow: none !important; border: 1px solid #E2E8F0 !important; border-radius: 16px !important; }
            .q-table th { font-weight: 800 !important; color: #94A3B8 !important; text-transform: uppercase !important; font-size: 11px !important; letter-spacing: 0.05em !important; }
        </style>
    ''')

class PIMApp:
    def __init__(self):
        self.active_page = 'dashboard'
        self.data = []
        self.columns = []
        self.loading = False

    async def navigate_to(self, page_name: str):
        self.active_page = page_name
        self.loading = True
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
                    resp = await client.get(f"{BACKEND_URL}{endpoint}")
                    if resp.status_code == 200:
                        raw_data = resp.json()
                        if page_name == 'products':
                            self.data = raw_data.get('products', [])
                        else:
                            self.data = raw_data
            except Exception as e:
                ui.notify(f"Errore caricamento: {str(e)}", type='negative')
                self.data = []
        
        self.loading = False
        content_area.refresh()

app_logic = PIMApp()

def sidebar_item(label: str, icon: str, page_name: str, badge: str = None):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'w-full justify-start py-2 px-3 sidebar-item {"active" if is_active else "text-slate-500"}').props('flat no-caps'):
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
            ui.spinner(size='lg', color='primary')
            ui.label('Caricamento dati...').classes('text-slate-400 mt-4 font-bold uppercase tracking-widest text-[10px]')
        return

    page = app_logic.active_page
    
    if page == 'dashboard':
        with ui.row().classes('w-full justify-between items-center mb-8'):
            with ui.column().classes('gap-1'):
                ui.label('Dashboard Repository').classes('text-2xl font-black text-slate-900 tracking-tight')
                ui.label('Gestisci i tuoi canali di acquisizione dati.').classes('text-slate-400 text-sm font-medium')
            ui.button('NUOVO CATALOGO', icon='add').classes('rounded-xl px-6 py-4 bg-slate-900 text-white font-bold').props('no-caps shadow-lg')
        
        with ui.grid(columns=4).classes('w-full gap-6'):
            for c in app_logic.data:
                with ui.card().classes('main-card p-6 gap-4'):
                    with ui.row().classes('w-full justify-between items-start'):
                        ui.avatar('folder', color='blue-50', text_color='blue-500').classes('rounded-lg')
                        ui.badge(c.get('status', 'STAGING').upper()).props('outline color=blue-3')
                    ui.label(c['name']).classes('text-lg font-bold text-slate-800')
                    ui.label(f"Prodotti: {c.get('product_count', 0)}").classes('text-xs text-slate-400')
                    ui.button('APRI REPOSITORY', color='primary').classes('w-full rounded-xl mt-2').props('no-caps')

    elif page == 'products':
        ui.label('Master ERP Library').classes('text-2xl font-black text-slate-900 tracking-tight mb-8')
        columns = [
            {'name': 'sku', 'label': 'SKU', 'field': 'sku', 'align': 'left'},
            {'name': 'title', 'label': 'NOME PRODOTTO', 'field': 'title', 'align': 'left'},
            {'name': 'brand', 'label': 'BRAND', 'field': 'brand', 'align': 'left'},
            {'name': 'price', 'label': 'PREZZO', 'field': 'price', 'align': 'right'},
        ]
        ui.table(columns=columns, rows=app_logic.data, row_key='sku').classes('w-full main-card bg-white p-4')

    elif page == 'brands':
        ui.label('Anagrafica Brands').classes('text-2xl font-black text-slate-900 tracking-tight mb-8')
        columns = [
            {'name': 'name', 'label': 'NOME BRAND', 'field': 'name', 'align': 'left'},
            {'name': 'id', 'label': 'ID SISTEMA', 'field': 'id', 'align': 'right'},
        ]
        ui.table(columns=columns, rows=app_logic.data, row_key='id').classes('w-full main-card bg-white p-4')

    elif page == 'categories':
        ui.label('Struttura Categorie').classes('text-2xl font-black text-slate-900 tracking-tight mb-8')
        columns = [
            {'name': 'name', 'label': 'CATEGORIA', 'field': 'name', 'align': 'left'},
            {'name': 'parentId', 'label': 'PARENT ID', 'field': 'parentId', 'align': 'right'},
        ]
        ui.table(columns=columns, rows=app_logic.data, row_key='id').classes('w-full main-card bg-white p-4')

@ui.page('/')
async def main_page():
    setup_styles()
    
    # ELEMENTI TOP-LEVEL
    with ui.header().classes('bg-white/80 backdrop-blur-md text-slate-800 border-b border-slate-200 px-8 py-3 flex justify-between items-center z-10'):
        ui.label('Industrial PIM Management').classes('text-[10px] font-black opacity-30 uppercase tracking-[0.2em]')
        with ui.row().classes('items-center gap-4'):
            ui.button(icon='refresh', on_click=lambda: app_logic.navigate_to(app_logic.active_page)).props('flat round color=grey-7')
            ui.avatar('AG').classes('text-[10px] bg-slate-900 text-white font-bold')

    with ui.left_drawer(value=True).classes('p-4 flex flex-col gap-0'):
        with ui.row().classes('items-center gap-3 mb-8 px-2'):
            with ui.element('div').classes('w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center font-black text-white shadow-lg'):
                ui.label('CH').classes('text-xs')
            with ui.column().classes('gap-0'):
                ui.label('ContentHunter').classes('text-base font-black tracking-tighter text-slate-900 leading-none')
                ui.label('ENTERPRISE PIM').classes('text-[8px] font-bold text-slate-400 mt-1 tracking-widest uppercase')
            
        with ui.scroll_area().classes('flex-1 pr-2'):
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
            
            ui.label('SISTEMA').classes('group-label')
            sidebar_item('Settings', 'settings', 'settings')

        ui.space()
        with ui.card().classes('bg-slate-50/50 border border-slate-200 p-4 rounded-2xl mb-4 cursor-pointer hover:bg-white transition-all'):
            with ui.row().classes('items-center gap-3'):
                ui.avatar('memory', color='white', text_color='slate-400').classes('rounded-lg shadow-sm border border-slate-100')
                with ui.column().classes('gap-0'):
                    ui.label('AI Hub').classes('text-[11px] font-black text-slate-900')
                    ui.label('GPT-4o Ready').classes('text-[8px] font-bold text-slate-400 uppercase tracking-tighter')

    # CONTENUTO PRINCIPALE
    with ui.column().classes('flex-1 p-0 w-full'):
        await content_area()
        # Primo caricamento
        if not app_logic.data:
            await app_logic.navigate_to('dashboard')

ui.run(title=TITLE, port=3001)
