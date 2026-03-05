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
                    resp = await client.get(f"{BACKEND_URL}{endpoint}", timeout=15)
                    if resp.status_code == 200:
                        raw_data = resp.json()
                        # Gestione flessibile della risposta (array o oggetto con chiave products)
                        if isinstance(raw_data, dict) and 'products' in raw_data:
                            self.data = raw_data['products']
                        elif isinstance(raw_data, list):
                            self.data = raw_data
                        else:
                            self.data = []
            except Exception as e:
                ui.notify(f"Errore caricamento: {str(e)}", type='negative')
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

# --- DESIGN SYSTEM ---
def setup_styles():
    ui.colors(primary='#111827', secondary='#F3F4F6', accent='#6B7280')
    ui.query('body').style('background-color: #F8F9FA; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            .q-drawer { background: #FFFFFF !important; border-right: 1px solid #E5E7EB !important; }
            
            /* Sidebar Item Fixed */
            .sidebar-btn { 
                margin: 4px 16px !important; 
                border-radius: 12px !important; 
                transition: all 0.2s; 
                color: #1F2937 !important; 
                font-weight: 700 !important;
                height: 52px !important;
                text-transform: none !important;
            }
            .sidebar-btn.active { 
                background-color: #111827 !important; 
                color: #FFFFFF !important; 
            }
            /* Assicura che icona e testo siano bianchi quando attivo */
            .sidebar-btn.active .q-icon, 
            .sidebar-btn.active .q-btn__content { 
                color: #FFFFFF !important; 
            }
            
            .group-label { 
                font-size: 11px; font-weight: 800; color: #94A3B8; 
                letter-spacing: 0.15em; padding: 30px 28px 12px 28px; 
            }

            .profile-card { 
                background: #F8FAFC; border-radius: 16px; margin: 0 16px 16px 16px; padding: 16px;
                border: 1px solid #F1F5F9;
            }
            
            .kpi-card { 
                border-radius: 20px; background: white; border: 1px solid #F1F5F9; 
                padding: 30px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); 
            }

            .product-table-row:hover {
                background-color: #F9FAFB !important;
                cursor: pointer;
            }
        </style>
    ''')

# --- SIDEBAR ---
@ui.refreshable
def sidebar_area():
    with ui.column().classes('w-full gap-0 h-full'):
        # Logo Section
        with ui.column().classes('items-center w-full py-14 px-6'):
            with ui.element('div').classes('w-28 h-28 bg-[#111827] rounded-[2rem] flex items-center justify-center shadow-xl mb-6'):
                ui.icon('precision_manufacturing', size='3.5rem', color='white')
            ui.label('CONTENT HUNTER').classes('text-lg font-black tracking-[0.2em] text-[#111827]')
            ui.label('ENGINE PIM').classes('text-[9px] font-black text-slate-300 tracking-[0.5em] -mt-1')

        # Main Navigation
        ui.label('MENU PRINCIPALE').classes('group-label')
        sidebar_button('Dashboard', 'dashboard', 'dashboard')
        sidebar_button('Master ERP', 'inventory', 'products')
        sidebar_button('Import Lab', 'auto_awesome', 'import')
        sidebar_button('Cataloghi', 'folder', 'repos')
        
        ui.label('ANAGRAFICHE').classes('group-label')
        sidebar_button('Brand Library', 'branding_watermark', 'brands')
        sidebar_button('Categorie', 'account_tree', 'categories')
        
        ui.space()
        
        # User & Footer
        with ui.column().classes('w-full gap-0'):
            ui.label('V. 7.0 [05/03/2026]').classes('px-8 py-4 text-[10px] font-black text-slate-300 uppercase letter-spacing-widest')
            
            with ui.row().classes('profile-card items-center gap-4'):
                with ui.element('div').classes('w-12 h-12 bg-white rounded-xl flex items-center justify-center text-[#111827] font-black border shadow-sm'):
                    ui.label('a').classes('text-xl')
                with ui.column().classes('gap-0'):
                    ui.label('Administrator').classes('text-sm font-black text-slate-800')
                    ui.label('SYSTEM ADMIN').classes('text-[9px] font-black text-slate-400 uppercase')
            
            with ui.button(on_click=lambda: ui.notify('Logout')).classes('w-full justify-start py-6 px-10 text-slate-400 font-bold').props('flat no-caps'):
                with ui.row().classes('items-center gap-4'):
                    ui.icon('logout', size='22px')
                    ui.label('ESCI')

def sidebar_button(label: str, icon: str, page_name: str):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'sidebar-btn {"active" if is_active else ""}').props('flat no-caps'):
        with ui.row().classes('items-center gap-4 w-full'):
            ui.icon(icon, size='24px')
            ui.label(label)

# --- CONTENT ---
@ui.refreshable
async def content_area():
    if app_logic.loading:
        with ui.column().classes('w-full items-center justify-center p-32'):
            ui.spinner_ios(size='xl', color='primary')
            ui.label('ECCESSO AI DATI...').classes('text-slate-300 mt-6 font-black tracking-widest text-[10px]')
        return

    page = app_logic.active_page
    with ui.column().classes('w-full p-16 gap-12 max-w-[1400px] mx-auto'):
        
        # Header dinamico basato sulla pagina
        with ui.column().classes('gap-1 mb-4'):
            title = 'Dashboard' if page == 'dashboard' else 'Master ERP Library' if page == 'products' else 'Anagrafiche'
            subtitle = 'Inserimento e interrogazione dati PIM'
            ui.label(title).classes('text-4xl font-black text-slate-900 tracking-tighter')
            ui.label(subtitle).classes('text-slate-400 text-sm font-medium')

        if page == 'dashboard':
            with ui.row().classes('w-full gap-8'):
                kpi_box('PRODOTTI', '3.840', 'inventory_2')
                kpi_box('CATALOGHI', '14', 'folder')
                kpi_box('SYNC', 'ONLINE', 'cloud_done')
            
            with ui.column().classes('w-full kpi-card'):
                ui.label('ATTIVITÀ RECENTI').classes('text-[10px] font-black text-slate-400 tracking-widest mb-6')
                if not app_logic.data:
                    ui.label('Nessuna attività recente trovato.').classes('text-slate-400 italic')
                else:
                    for item in app_logic.data[:5]:
                        with ui.row().classes('w-full py-5 border-b border-slate-50 items-center justify-between'):
                            ui.label(item.get('name', 'Sync Repository')).classes('font-black text-slate-800')
                            ui.badge('COMPLETATO').props('color=emerald-1 text-emerald-7 font-bold')

        elif page == 'products':
            with ui.column().classes('w-full kpi-card p-0 overflow-hidden'):
                # Header Tabella
                with ui.row().classes('w-full bg-slate-50 p-6 border-b border-slate-100 items-center gap-6'):
                    ui.label('SKU').classes('w-32 text-[10px] font-black text-slate-400 tracking-widest')
                    ui.label('DESCRIZIONE PRODOTTO').classes('flex-1 text-[10px] font-black text-slate-400 tracking-widest')
                    ui.label('PREZZO').classes('w-32 text-[10px] font-black text-slate-400 tracking-widest text-right')
                    ui.label('STATO').classes('w-32 text-[10px] font-black text-slate-400 tracking-widest text-center')

                # Lista Prodotti
                if not app_logic.data:
                    ui.label('Nessun prodotto trovato.').classes('p-10 text-slate-400 italic text-center w-full')
                else:
                    for p in app_logic.data:
                        with ui.row().classes('w-full p-6 border-b border-slate-50 items-center gap-6 product-table-row').on('click', lambda p=p: app_logic.open_product_detail(p['sku'])):
                            ui.label(p['sku']).classes('w-32 font-black text-blue-500 text-xs')
                            ui.label(p['title']).classes('flex-1 font-black text-slate-800 truncate')
                            ui.label(f"€ {p['price'] or 0.0:.2f}").classes('w-32 font-black text-slate-900 text-right')
                            with ui.element('div').classes('w-32 flex justify-center'):
                                ui.badge('PRONTO').props('color=blue-50 text-blue-600 font-bold px-4 rounded-lg')

def kpi_box(label, value, icon):
    with ui.column().classes('kpi-card flex-1'):
        with ui.element('div').classes('p-3 bg-slate-50 rounded-xl mb-4 inline-block border'):
            ui.icon(icon, color='slate-900', size='24px')
        ui.label(label).classes('text-[10px] font-black text-slate-400 tracking-widest uppercase')
        ui.label(value).classes('text-2xl font-black text-slate-900 mt-1 tracking-tighter')

@ui.refreshable
def modal_content():
    p = app_logic.selected_product
    if not p: return
    with ui.column().classes('p-16 gap-8 w-full'):
        ui.label(p['sku']).classes('text-xs font-black text-blue-500 tracking-widest')
        ui.label(p['translations'].get('it', {}).get('title', 'Prodotto')).classes('text-3xl font-black tracking-tighter')
        ui.textarea('Descrizione', value=p['translations'].get('it', {}).get('description', '')).classes('w-full').props('outlined rounded-2xl')
        ui.button('CHIUDI', on_click=app_logic.product_modal.close).classes('bg-slate-900 text-white rounded-xl px-12 py-4 font-black shadow-xl')

@ui.page('/')
async def main_page():
    setup_styles()
    with ui.dialog().classes('w-full max-w-5xl') as product_modal:
        app_logic.product_modal = product_modal
        with ui.card().classes('p-0 w-full rounded-[2.5rem] bg-white border-0'):
            modal_content()

    with ui.left_drawer(value=True, fixed=True).classes('p-0 shadow-none'):
        sidebar_area()
    with ui.column().classes('flex-1 w-full'):
        await content_area()

ui.run(title=TITLE, host='0.0.0.0', port=PORT, show=False, reload=False)
