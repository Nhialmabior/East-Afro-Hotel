const $=s=>document.querySelector(s);const $$=s=>document.querySelectorAll(s);$('#year').textContent=new Date().getFullYear();const menu=$('.menu-toggle');menu.addEventListener('click',()=>{const open=$('#nav').classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.textContent=open?'✕':'☰'});$$('#nav a').forEach(a=>a.addEventListener('click',()=>{$('#nav').classList.remove('open');menu.setAttribute('aria-expanded','false');menu.textContent='☰'}));
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const today=new Date();today.setHours(0,0,0,0);$('#checkin').min=iso(today);$('#checkout').min=iso(new Date(today.getTime()+86400000));$('#checkin').addEventListener('change',()=>{const d=new Date($('#checkin').value+'T00:00:00');if(isNaN(d))return;d.setDate(d.getDate()+1);$('#checkout').min=iso(d);if(!$('#checkout').value||$('#checkout').value<$('#checkout').min)$('#checkout').value=$('#checkout').min});
const dialog=$('#dialog');function notice(title,message){$('#dialogTitle').textContent=title;$('#dialogMessage').textContent=message;if(typeof dialog.showModal==='function')dialog.showModal();else alert(title+'\n'+message)}$('#closeDialog').onclick=()=>dialog.close();$('#dialogOk').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
function prepareEmail(to,subject,body){if(!to){notice('Configuration needed','The hotel email address has not been configured yet. Please add a verified address in config.js before enabling enquiries.');return}window.location.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;notice('Email draft prepared','Your email application should open with the enquiry. Please send it there. This website does not submit or confirm reservations automatically.')}
const cfg=window.HOTEL_CONFIG||{};
const db=cfg.supabaseUrl&&cfg.supabaseAnonKey&&window.supabase?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
async function saveRequest(table,payload){if(!db)return false;const {error}=await db.from(table).insert(payload);if(error)throw error;return true}
$('#bookingForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);if(f.get('website'))return;if(f.get('checkout')<=f.get('checkin')){notice('Check your dates','Check-out must be later than check-in.');return}const button=form.querySelector('[type=submit]');button.disabled=true;try{const payload={guest_name:String(f.get('name')).trim(),guest_email:String(f.get('email')).trim(),guest_phone:String(f.get('phone')||'').trim(),check_in:f.get('checkin'),check_out:f.get('checkout'),guests:Number.parseInt(f.get('guests'),10)||2,room_preference:String(f.get('room'))};if(await saveRequest('reservation_requests',payload)){notice('Request received','Your reservation request was received. This is NOT a confirmed booking. Hotel staff must confirm availability and rates.');form.reset()}else{const details=`Reservation enquiry - East Afro Hotel\n\nName: ${payload.guest_name}\nEmail: ${payload.guest_email}\nPhone: ${payload.guest_phone}\nCheck-in: ${payload.check_in}\nCheck-out: ${payload.check_out}\nGuests: ${f.get('guests')}\nRoom preference: ${payload.room_preference}\n\nPlease confirm availability and rates.`;prepareEmail(cfg.reservationsEmail,'Room availability enquiry',details)}}catch(err){console.error(err);notice('Could not submit','Your request could not be sent. Please contact the hotel directly.')}finally{button.disabled=false}});
$$('.room-book').forEach(b=>b.addEventListener('click',()=>{$('#roomSelect').value=b.dataset.room;$('#booking').scrollIntoView({behavior:'smooth'});$('#checkin').focus({preventScroll:true})}));
$('#contactForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);if(f.get('website'))return;const button=form.querySelector('[type=submit]');button.disabled=true;try{const payload={sender_name:String(f.get('name')).trim(),sender_email:String(f.get('email')).trim(),sender_phone:String(f.get('phone')||'').trim(),topic:String(f.get('topic')),message:String(f.get('message')).trim()};if(await saveRequest('contact_messages',payload)){notice('Message received','Thank you. Your message was received by the hotel enquiry system.');form.reset()}else prepareEmail(cfg.contactEmail,`East Afro Hotel: ${payload.topic}`,`Name: ${payload.sender_name}\nEmail: ${payload.sender_email}\nPhone: ${payload.sender_phone}\nTopic: ${payload.topic}\n\n${payload.message}`)}catch(err){console.error(err);notice('Could not submit','Your message could not be sent. Please contact the hotel directly.')}finally{button.disabled=false}});
$$('.filter').forEach(b=>b.addEventListener('click',()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.gallery-grid img').forEach(im=>im.hidden=b.dataset.filter!=='all'&&im.dataset.category!==b.dataset.filter)}));

// Public availability is an indicative count; it does not reserve rooms or disclose guest data.
const availabilityButton=$('#checkAvailability');
availabilityButton.addEventListener('click',async()=>{
 const result=$('#availabilityResult'),start=$('#checkin').value,end=$('#checkout').value,room=$('#roomSelect').value;
 if(!start||!end||end<=start){result.textContent='Choose valid check-in and check-out dates first.';return}
 if(!db){result.textContent='Live availability is not configured yet. Please send an enquiry.';return}
 availabilityButton.disabled=true;result.textContent='Checking indicative availability…';
 try{const {data,error}=await db.rpc('public_room_availability',{p_check_in:start,p_check_out:end,p_room_type:room==='Any room'?null:room});
 if(error)throw error;const rows=Array.isArray(data)?data:[];
 if(!rows.length){result.textContent='No matching room inventory is currently published. Please send an enquiry.';return}
 result.replaceChildren();rows.forEach(r=>{const line=document.createElement('p');line.textContent=`${r.room_type}: ${r.available_rooms} of ${r.total_rooms} rooms potentially available${r.nightly_rate_from_usd===null?'':` · indicative rates from $${Number(r.nightly_rate_from_usd).toFixed(2)}/night`}`;result.appendChild(line)});
 const note=document.createElement('small');note.textContent='Indicative only. Availability can change before hotel staff confirm your booking.';result.appendChild(note);
 }catch(e){console.error(e);result.textContent='Availability could not be checked. You can still submit an enquiry.'}finally{availabilityButton.disabled=false}
});

// Version 6 progressive enhancements. Existing booking, contact, Supabase and admin workflows remain intact.
const staySummary=$('#staySummary');
function updateStaySummary(){
 const start=$('#checkin').value,end=$('#checkout').value;
 if(!start||!end||end<=start){staySummary.textContent='Choose valid check-in and check-out dates to see your stay length.';return}
 const nights=Math.round((new Date(end+'T00:00:00')-new Date(start+'T00:00:00'))/86400000);
 staySummary.textContent=`Your selected stay: ${nights} night${nights===1?'':'s'} · ${start} to ${end}. This is not a confirmed reservation.`;
}
$('#checkin').addEventListener('change',updateStaySummary);
$('#checkout').addEventListener('change',updateStaySummary);
updateStaySummary();

// Open gallery photos in an accessible native dialog without changing the gallery filters.
const galleryDialog=$('#galleryDialog'),galleryPreview=$('#galleryPreview'),galleryCaption=$('#galleryCaption');
$$('.gallery-grid img').forEach(img=>{
 img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label',`View larger image: ${img.alt}`);
 const openPreview=()=>{galleryPreview.src=img.currentSrc||img.src;galleryPreview.alt=img.alt;galleryCaption.textContent=img.alt;if(typeof galleryDialog.showModal==='function')galleryDialog.showModal();else window.open(img.src,'_blank','noopener');};
 img.addEventListener('click',openPreview);img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPreview();}});
});
$('#closeGallery').addEventListener('click',()=>galleryDialog.close());
galleryDialog.addEventListener('click',e=>{if(e.target===galleryDialog)galleryDialog.close()});
galleryDialog.addEventListener('close',()=>{galleryPreview.removeAttribute('src')});

// Keep the mobile menu keyboard-friendly and close it when Escape is pressed.
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#nav').classList.contains('open')){ $('#nav').classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation menu');menu.textContent='☰';menu.focus();}});
menu.addEventListener('click',()=>menu.setAttribute('aria-label',$('#nav').classList.contains('open')?'Close navigation menu':'Open navigation menu'));

// Back-to-top affordance appears after the visitor scrolls down.
const backToTop=$('#backToTop');
const updateBackToTop=()=>backToTop.classList.toggle('visible',window.scrollY>500);
window.addEventListener('scroll',updateBackToTop,{passive:true});updateBackToTop();
backToTop.addEventListener('click',()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
