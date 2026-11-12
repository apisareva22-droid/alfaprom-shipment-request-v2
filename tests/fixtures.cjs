function valid(overrides={}) {
  return {customerType:'legal',legalInn:'7707083893',legalName:'ООО Тест',legalSigner:'Тестов Тест Тестович',deliveryType:'carrier',carrier:'ПЭК',carrierCity:'Самара',carrierDeliveryMode:'terminal',terminal:'Самара, терминал',deliveryPayer:'Получатель',recipientSame:true,recipientType:'legal',recipientContactName:'Тестов Получатель',recipientPhone:'+7 900 123-45-67',shipmentBasis:'ТЕСТ-001 от 12.11.2026',originalsMethod:'ЭДО',signMethod:'print',...overrides};
}
module.exports={valid};
