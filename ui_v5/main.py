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
        self.selected_product = None
        sidebar_area.refresh()
        content_area.refresh()
        
        endpoint_map = {
            'dashboard': '/api/v5/repositories',
            'products': '/api/v5/products',
            'brands': '/api/v5/brands',
            'categories': '/api/v5/categories',
            'bullets': '/api/v5/products', # Placeholder per ora
        }
        
        endpoint = endpoint_map.get(page_name)
        if endpoint:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(f"{BACKEND_URL}{endpoint}", timeout=10)
                    if resp.status_code == 200:
                        raw_data = resp.json()
                        self.data = raw_data.get('products', raw_data) if 'products' in raw_data else raw_data
            except Exception as e:
                ui.notify(f"Errore DB: {str(e)}", type='negative')
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
                else:
                    ui.notify("Prodotto non trovato", type='negative')
                    if self.product_modal: self.product_modal.close()
        except Exception as e:
            ui.notify(f"Errore: {str(e)}", type='negative')
            if self.product_modal: self.product_modal.close()
            
        self.product_detail_loading = False
        modal_content.refresh()

app_logic = PIMApp()

# --- DESIGN SYSTEM ---
def setup_styles():
    ui.colors(primary='#262626', secondary='#737373', accent='#3B82F6', dark='#171717')
    ui.query('body').style('background-color: #F8FAFC; color: #1E293B; font-family: "Outfit", sans-serif;')
    ui.add_head_html('''
        <style>
            .sidebar-item { border-radius: 12px; margin: 4px 6px; transition: all 0.2s; font-weight: 600; color: #64748B; }
            .sidebar-item:hover { background-color: #F1F5F9; color: #3B82F6; }
            .sidebar-item.active { background-color: #FFFFFF; color: #0F172A; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid #E2E8F0; }
            .group-label { font-size: 10px; font-weight: 800; color: #94A3B8; letter-spacing: 0.15em; padding: 20px 20px 8px 20px; }
            .main-card { border-radius: 20px; border: 1px solid #E2E8F0; background: white; box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1); }
            .product-row:hover { background-color: #F8FAFC; border-color: #3B82F6; }
            .badge-ai { background: linear-gradient(135deg, #3B82F6, #8B5CF6); color: white; border-radius: 6px; padding: 2px 6px; font-size: 9px; font-weight: 900; }
            .tab-btn { border-radius: 12px; font-weight: 800; font-size: 12px; text-transform: uppercase; }
            .tab-btn.active { color: #3B82F6; background: #EFF6FF; border: 1px solid #DBEAFE; }
        </style>
    ''')

# --- COMPONENTI UI ---
@ui.refreshable
def sidebar_area():
    with ui.column().classes('w-full gap-0'):
        ui.label('CORE NAV').classes('group-label')
        sidebar_item('Dashboard', 'dashboard', 'dashboard')
        sidebar_item('Master ERP', 'database', 'products')
        sidebar_item('Import Lab', 'auto_awesome', 'import', badge='AI')
        
        ui.label('ANAGRAFICHE').classes('group-label')
        sidebar_item('Brand Library', 'branding_watermark', 'brands')
        sidebar_item('Categorie / Albero', 'account_tree', 'categories')
        sidebar_item('Bullet Points', 'format_list_bulleted', 'bullets')

def sidebar_item(label: str, icon: str, page_name: str, badge: str = None):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'w-full justify-start py-3 px-4 sidebar-item {"active" if is_active else ""}').props('flat no-caps'):
        with ui.row().classes('items-center gap-3 w-full'):
            ui.icon(icon).classes('text-lg opacity-70')
            ui.label(label).classes('text-[13px]')
            if badge:
                ui.space()
                with ui.element('span').classes('badge-ai'): ui.label(badge)

@ui.refreshable
async def content_area():
    if app_logic.loading:
        with ui.column().classes('w-full items-center justify-center p-32'):
            ui.spinner_ios(size='xl', color='primary')
            ui.label('SINCRONIZZAZIONE DATI...').classes('text-slate-400 mt-6 font-black tracking-widest text-xs')
        return

    page = app_logic.active_page
    with ui.column().classes('max-w-7xl mx-auto w-full px-12 py-12 gap-10'):
        # HEADER DELLA PAGINA
        with ui.row().classes('w-full justify-between items-center'):
            with ui.column().classes('gap-1'):
                titles = {
                    'dashboard': ('Catalog Repository', 'Gestione dei canali di importazione PDF e Staging.'),
                    'products': ('Master ERP Library', 'Elenco generale dei prodotti validati nel PIM.'),
                    'brands': ('Brand Management', 'Anagrafica completa dei marchi distribuiti.'),
                    'categories': ('Category Tree', 'Struttura gerarchica del catalogo commerciale.'),
                    'bullets': ('Bullet Point Factory', 'Analisi e ottimizzazione dei punti elenco tecnici.')
                }
                t, s = titles.get(page, ('Engine', 'PIM Control Center'))
                ui.label(t).classes('text-4xl font-black text-slate-900 tracking-tighter')
                ui.label(s).classes('text-slate-400 text-sm font-medium')
            
            if page == 'dashboard':
                ui.button('NUOVO CATALOGO', icon='add').classes('rounded-2xl px-8 py-5 bg-slate-900 text-white font-black text-xs shadow-xl').props('no-caps')

        # CONTENUTO DINAMICO
        if page == 'dashboard':
            with ui.grid(columns=3).classes('w-full gap-8'):
                for c in app_logic.data:
                    with ui.card().classes('main-card p-8 gap-4 cursor-pointer hover:shadow-xl transition-all'):
                        with ui.row().classes('w-full justify-between items-start'):
                            ui.avatar('folder', color='slate-100', text_color='slate-600').classes('rounded-2xl')
                            ui.badge('ONLINE').props('color=emerald-5 text-[10px] font-bold')
                        ui.label(c['name']).classes('text-xl font-black text-slate-800 tracking-tight')
                        ui.label(f"Importazioni attive: {c.get('pdf_count', 0)}").classes('text-xs text-slate-400 font-bold')
                        ui.button('APRI REPOSITORY', color='primary').classes('w-full rounded-xl mt-4 font-black py-3 text-xs').props('no-caps outline')

        elif page == 'products':
            with ui.column().classes('w-full gap-4'):
                if not app_logic.data:
                    ui.label('Nessun prodotto trovato nel Master ERP.').classes('text-slate-400 italic py-10 text-center w-full')
                else:
                    for p in app_logic.data:
                        with ui.card().classes('main-card p-5 product-row cursor-pointer transition-all border-slate-100').on('click', lambda p=p: app_logic.open_product_detail(p['sku'])):
                            with ui.row().classes('items-center w-full gap-8'):
                                # Image
                                with ui.element('div').classes('w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 overflow-hidden'):
                                    if p.get('imageUrl'): ui.image(p['imageUrl']).classes('w-full h-full object-contain')
                                    else: ui.icon('inventory_2', size='lg').classes('text-slate-200')
                                
                                with ui.column().classes('flex-1 gap-1'):
                                    ui.label(p['sku']).classes('text-[10px] font-black text-blue-500 tracking-widest')
                                    ui.label(p['title']).classes('text-base font-black text-slate-900 truncate max-w-xl')
                                    ui.row([
                                        ui.badge(p.get('brand', 'Generic')).props('outline color=slate-4 text-[9px]').classes('px-3'),
                                        ui.badge(p.get('category', 'Uncategorized')).props('outline color=slate-4 text-[9px]').classes('px-3')
                                    ]).classes('gap-2')
                                
                                with ui.column().classes('items-end gap-1'):
                                    ui.label('PREZZO UNITARIO').classes('text-[9px] font-black text-slate-300 tracking-widest')
                                    ui.label(f"€ {p['price'] or 0.0:.2f}").classes('text-xl font-black text-slate-900')
                                ui.icon('chevron_right').classes('text-slate-300 ml-4')

        elif page == 'brands' or page == 'categories':
            with ui.grid(columns=4).classes('w-full gap-6'):
                for item in app_logic.data:
                    with ui.card().classes('main-card p-6 items-center gap-4'):
                        ui.avatar('business' if page == 'brands' else 'layers', color='slate-50', text_color='slate-400')
                        ui.label(item['name']).classes('font-black text-center text-slate-800')
                        ui.label(f"ID: {item['id']}").classes('text-[10px] text-slate-300 font-bold')

@ui.refreshable
def modal_content():
    if app_logic.product_detail_loading:
        with ui.column().classes('w-full h-[600px] items-center justify-center'):
            ui.spinner_ios(size='xl', color='primary')
            ui.label('COLLEGAMENTO BACKEND...').classes('text-slate-400 mt-6 font-black tracking-widest text-[10px]')
        return
    
    p = app_logic.selected_product
    if not p: return

    with ui.column().classes('w-full h-full gap-0'):
        # HEADER MODAL
        with ui.row().classes('w-full p-10 border-b border-slate-100 bg-white justify-between items-center'):
            with ui.row().classes('items-center gap-6'):
                with ui.element('div').classes('p-5 bg-slate-900 rounded-3xl shadow-2xl'):
                    ui.icon('inventory_2', color='white', size='md')
                with ui.column().classes('gap-0'):
                    ui.label(p['sku']).classes('text-[11px] font-black text-blue-500 tracking-[0.3em] uppercase')
                    ui.label(p['translations'].get('it', {}).get('title', 'Untitled')).classes('text-3xl font-black text-slate-900 tracking-tighter')
            
            with ui.row().classes('gap-4'):
                ui.button('AI RE-WRITE', icon='auto_awesome').classes('rounded-2xl bg-blue-600 text-white font-black px-8 py-4 shadow-lg').props('no-caps')
                ui.button(on_click=lambda: app_logic.product_modal.close(), icon='close').classes('bg-slate-100 text-slate-400').props('flat round')

        # TAB SYSTEM
        with ui.row().classes('w-full bg-slate-50 px-10 py-4 gap-4 border-b border-slate-100'):
            ui.button('INFORMAZIONI BASE', on_click=lambda: setattr(app_logic, 'active_tab', 'base')).classes('tab-btn px-6 py-2 active').props('flat no-caps')
            ui.button('MEDIA & ASSET', on_click=lambda: setattr(app_logic, 'active_tab', 'media')).classes('tab-btn px-6 py-2').props('flat no-caps')
            ui.button('SEO & AI', on_click=lambda: setattr(app_logic, 'active_tab', 'seo')).classes('tab-btn px-6 py-2').props('flat no-caps')
            ui.button('ATTRIBUTI EAV', on_click=lambda: setattr(app_logic, 'active_tab', 'eav')).classes('tab-btn px-6 py-2').props('flat no-caps')

        # CONTENT AREA
        with ui.scroll_area().classes('flex-1 p-12 bg-white'):
            with ui.column().classes('w-full gap-12'):
                with ui.grid(columns=2).classes('w-full gap-12'):
                    with ui.column().classes('gap-6'):
                        ui.label('CORE CONTENT (IT)').classes('text-[10px] font-black text-slate-400 tracking-[0.2em]')
                        ui.input('Titolo Commerciale', value=p['translations'].get('it', {}).get('title', '')).classes('w-full').props('outlined rounded-xl')
                        ui.textarea('Descrizione Estesa', value=p['translations'].get('it', {}).get('description', '')).classes('w-full h-48').props('outlined rounded-2xl')
                    
                    with ui.column().classes('gap-6'):
                        ui.label('CLASSIFICAZIONE & ERP').classes('text-[10px] font-black text-slate-400 tracking-[0.2em]')
                        with ui.grid(columns=2).classes('w-full gap-6'):
                            ui.input('Marchio / Brand', value=p.get('brand')).classes('w-full').props('outlined rounded-xl')
                            ui.input('Barcode EAN', value=p.get('ean')).classes('w-full').props('outlined rounded-xl')
                        ui.input('Categoria Primaria', value=p.get('category')).classes('w-full').props('outlined rounded-xl')
                        ui.input('Listino Prezzi', value=str(p.get('price', '0.00'))).classes('w-full').props('outlined rounded-xl prefix="€" font-black')

                ui.separator().classes('opacity-50')
                
                ui.label('CARATTERISTICHE / BULLET POINTS').classes('text-[10px] font-black text-slate-400 tracking-[0.2em]')
                ui.textarea(value=p['translations'].get('it', {}).get('bulletPoints', '')).classes('w-full').props('outlined rounded-2xl autogrow')

        # FOOTER MODAL
        with ui.row().classes('w-full p-10 border-t border-slate-100 justify-end items-center bg-white gap-6'):
            ui.button('ANNULLA', on_click=lambda: app_logic.product_modal.close()).classes('text-slate-400 font-black px-8 py-4').props('flat no-caps')
            ui.button('ESEGUI SALVATAGGIO', icon='save').classes('bg-slate-900 text-white font-black px-12 py-4 rounded-2xl shadow-2xl').props('no-caps')

@ui.page('/')
async def main_page():
    setup_styles()
    
    # Dialog Modal (Scoped safely inside the page)
    with ui.dialog().classes('w-full max-w-[1300px]') as product_modal:
        app_logic.product_modal = product_modal
        with ui.card().classes('p-0 w-full overflow-hidden rounded-[3rem] bg-white border-0'):
            modal_content()

    with ui.header().classes('bg-white/90 backdrop-blur-xl text-slate-800 border-b border-slate-100 px-12 py-5 flex justify-between items-center z-10'):
        with ui.row().classes('items-center gap-4'):
            ui.label('ContentHunter').classes('text-2xl font-black tracking-tighter text-slate-900')
            ui.badge('V5 ENTERPRISE').props('color=blue-1 text-blue-6 font-bold text-[9px]')
        with ui.row().classes('gap-8 items-center'):
            ui.label('Status: Database Connected').classes('text-[10px] font-black text-emerald-500 uppercase tracking-widest')
            ui.avatar('AG').classes('bg-slate-900 text-white font-black border-4 border-slate-100 shadow-xl')

    with ui.left_drawer(value=True, fixed=True).classes('p-4 flex flex-col gap-0 border-r border-slate-100 shadow-sm'):
        sidebar_area()
        ui.space()
        with ui.card().classes('bg-slate-900 p-6 rounded-3xl m-4'):
            with ui.row().classes('items-center gap-4'):
                ui.icon('auto_awesome', color='white', size='sm')
                ui.label('AI Lab Active').classes('text-xs font-black text-white')

    with ui.column().classes('flex-1 w-full bg-[#F8FAFC] min-h-screen'):
        await content_area()
        if not app_logic.data and not app_logic.loading:
            await app_logic.navigate_to('dashboard')

ui.run(title=TITLE, host='0.0.0.0', port=PORT, show=False, reload=False)
