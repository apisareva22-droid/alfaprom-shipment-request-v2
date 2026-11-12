(function () {
  ['person','recipient','rep'].forEach(prefix=>{
    const input=document.querySelector('[name="'+prefix+'Passport"]'),type=document.querySelector('[name="'+prefix+'PassportType"]');
    input.addEventListener('input',function(){
      const old=input.value,pos=input.selectionStart||0;
      const compact=old.toUpperCase().replace(type.value==='foreign'?/[^0-9A-ZА-ЯЁ]/g:/\D/g,'');
      const next=type.value==='ru'?(compact.slice(0,4)+(compact.length>4?' '+compact.slice(4,10):'')):compact.slice(0,24);
      input.value=next;const position=Math.max(0,pos+next.length-old.length);input.setSelectionRange(position,position);
    });
    type.addEventListener('change',function(){input.value='';input.placeholder=type.value==='ru'?'0000 000000':'Номер иностранного документа';input.inputMode=type.value==='ru'?'numeric':'text';});
  });
}());
