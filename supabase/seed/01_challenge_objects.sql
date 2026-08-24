-- =============================================================================
-- Mira — catálogo inicial de objetos (§3)
--
-- Criterios de admisión: cotidiano, fácil de encontrar en casa, seguro,
-- visualmente inconfundible, apropiado para todas las edades. Nada que empuje
-- a salir a la calle, entrar a algún lado, manipular objetos peligrosos ni
-- exponer información privada.
--
-- Estos objetos entran ya aprobados porque están curados a mano. Cualquier
-- objeto generado por IA arranca en 'draft' y tiene que pasar el pipeline.
-- =============================================================================

insert into challenge_objects
  (object_name, display_name, description, difficulty, aliases, visual_criteria, status, safety_reviewed_at, generated_by_ai)
values
  ('mug', 'una taza', 'Cualquier taza de café, té o mate cocido.', 'easy',
   array['taza','tazón','mug','pocillo','coffee cup','cup'],
   array['Se ve un recipiente para beber, de cerámica, vidrio o metal.',
         'Tiene forma de taza: cuerpo cilíndrico o cónico, boca abierta.',
         'Un vaso liso sin asa también cuenta; una caja o un bol de comida no.'],
   'approved', now(), false),

  ('shoe', 'una zapatilla', 'Una zapatilla, zapato o cualquier calzado.', 'easy',
   array['zapatilla','zapato','calzado','championes','tenis','sneaker','shoe'],
   array['Se ve calzado de forma clara y reconocible.',
         'Puede estar puesto o no.',
         'Una media sola o una plantilla suelta no cuentan.'],
   'approved', now(), false),

  ('key', 'una llave', 'Una llave o un llavero.', 'easy',
   array['llave','llaves','llavero','key','keys','keychain'],
   array['Se ve al menos una llave metálica con paletón dentado o forma de llave moderna.',
         'Un llavero con llaves cuenta.',
         'Una tarjeta magnética o un control de portón no cuentan.'],
   'approved', now(), false),

  ('backpack', 'una mochila', 'Una mochila o bolso de mano.', 'easy',
   array['mochila','bolso','morral','backpack','bag'],
   array['Se ve un bolso con tirantes o asas, pensado para cargar cosas.',
         'Una bolsa de supermercado no cuenta.'],
   'approved', now(), false),

  ('bottle', 'una botella', 'Una botella de agua, gaseosa o termo.', 'easy',
   array['botella','botellita','termo','cantimplora','bottle'],
   array['Se ve un recipiente alto de cuello angosto, con o sin tapa.',
         'Un vaso o una taza no cuentan: tiene que tener cuello.'],
   'approved', now(), false),

  ('headphones', 'unos auriculares', 'Auriculares de cualquier tipo.', 'easy',
   array['auriculares','audífonos','cascos','headphones','earbuds','airpods'],
   array['Se ven auriculares de vincha, in-ear o su estuche abierto mostrando los auriculares.',
         'Un parlante bluetooth no cuenta.'],
   'approved', now(), false),

  ('book', 'un libro', 'Un libro impreso, abierto o cerrado.', 'easy',
   array['libro','novela','cuaderno de tapa dura','book'],
   array['Se ve un objeto encuadernado con páginas.',
         'Una revista o un cuaderno también cuentan.',
         'Un libro en la pantalla de un dispositivo no cuenta.'],
   'approved', now(), false),

  ('spoon', 'una cuchara', 'Una cuchara de cualquier tamaño.', 'easy',
   array['cuchara','cucharita','cucharón','spoon'],
   array['Se ve un utensilio con mango y una cavidad ovalada en la punta.',
         'Un tenedor o un cuchillo no cuentan.'],
   'approved', now(), false),

  ('watch', 'un reloj', 'Un reloj de pulsera, de pared o despertador.', 'easy',
   array['reloj','reloj de pulsera','despertador','watch','clock'],
   array['Se ve un dispositivo cuya función principal es mostrar la hora.',
         'Un smartwatch cuenta.',
         'La hora en la pantalla de bloqueo de un celular no cuenta.'],
   'approved', now(), false),

  ('remote', 'un control remoto', 'El control del televisor o del aire.', 'easy',
   array['control remoto','control','mando','remote','remote control'],
   array['Se ve un dispositivo alargado cubierto de botones.',
         'Un joystick o un teclado no cuentan.'],
   'approved', now(), false),

  ('plant', 'una planta', 'Una planta de interior o de balcón.', 'easy',
   array['planta','maceta','cactus','suculenta','plant'],
   array['Se ve una planta viva con hojas, tallo o cuerpo vegetal.',
         'Una planta artificial cuenta si es visualmente convincente.',
         'Una flor cortada en un florero cuenta.'],
   'approved', now(), false),

  ('glasses', 'unos anteojos', 'Anteojos de ver o de sol.', 'easy',
   array['anteojos','lentes','gafas','glasses','sunglasses'],
   array['Se ven dos lentes unidos por un puente, con patillas.',
         'Pueden estar puestos o apoyados.'],
   'approved', now(), false),

  ('laptop', 'una computadora', 'Una notebook o computadora de escritorio.', 'easy',
   array['computadora','notebook','laptop','pc','ordenador','computer'],
   array['Se ve una computadora con pantalla y teclado.',
         'Un celular o una tablet sin teclado no cuentan.'],
   'approved', now(), false),

  ('glass', 'un vaso', 'Un vaso de vidrio, plástico o metal.', 'easy',
   array['vaso','copa','glass','tumbler'],
   array['Se ve un recipiente para beber de boca abierta y sin asa.',
         'Una taza con asa no cuenta.'],
   'approved', now(), false),

  ('pillow', 'una almohada', 'Una almohada o almohadón.', 'easy',
   array['almohada','almohadón','cojín','pillow','cushion'],
   array['Se ve una pieza textil blanda y rellena, rectangular o cuadrada.',
         'Un acolchado o una manta no cuentan.'],
   'approved', now(), false),

  ('charger', 'un cargador', 'Un cargador o cable de carga.', 'easy',
   array['cargador','cable','cable usb','charger','power adapter'],
   array['Se ve un cable de carga o un transformador con enchufe.',
         'Un auricular con cable no cuenta.'],
   'approved', now(), false),

  ('pen', 'una lapicera', 'Una lapicera, birome o lápiz.', 'easy',
   array['lapicera','birome','bolígrafo','lápiz','pen','pencil'],
   array['Se ve un instrumento de escritura alargado.',
         'Un marcador o resaltador también cuentan.'],
   'approved', now(), false),

  ('cap', 'una gorra', 'Una gorra o sombrero.', 'medium',
   array['gorra','sombrero','cap','hat','beanie'],
   array['Se ve una prenda para la cabeza.',
         'Puede estar puesta o apoyada.'],
   'approved', now(), false),

  ('ball', 'una pelota', 'Una pelota de cualquier deporte.', 'medium',
   array['pelota','balón','ball','football','basketball'],
   array['Se ve un objeto esférico usado para jugar.',
         'Una fruta redonda no cuenta.'],
   'approved', now(), false),

  ('coin', 'una moneda', 'Una moneda de cualquier país.', 'medium',
   array['moneda','monedas','coin','change'],
   array['Se ve al menos una moneda metálica circular.',
         'Un billete no cuenta.',
         'No hace falta que se distinga el valor.'],
   'approved', now(), false),

  ('chair', 'una silla', 'Una silla, banqueta o sillón.', 'easy',
   array['silla','banqueta','sillón','butaca','chair','stool'],
   array['Se ve un mueble para sentarse, con asiento y respaldo o patas.',
         'Un sofá cuenta.'],
   'approved', now(), false),

  ('towel', 'una toalla', 'Una toalla de baño o de mano.', 'easy',
   array['toalla','toallón','towel'],
   array['Se ve una pieza de tela absorbente, típicamente de toalla afelpada.',
         'Un trapo de cocina cuenta.'],
   'approved', now(), false),

  ('fork', 'un tenedor', 'Un tenedor de mesa.', 'easy',
   array['tenedor','fork'],
   array['Se ve un utensilio con mango y dientes o púas.',
         'Una cuchara o un cuchillo no cuentan.'],
   'approved', now(), false),

  ('mirror', 'un espejo', 'Un espejo de pared o de mano.', 'medium',
   array['espejo','mirror'],
   array['Se ve una superficie reflectante con marco o borde definido.',
         'Un vidrio de ventana no cuenta.'],
   'approved', now(), false),

  ('lamp', 'una lámpara', 'Una lámpara de mesa, pie o techo.', 'easy',
   array['lámpara','velador','luz','lamp','light'],
   array['Se ve un artefacto de iluminación con pantalla, base o bombilla visible.',
         'La luz del techo sin artefacto visible no cuenta.'],
   'approved', now(), false),

  ('plate', 'un plato', 'Un plato de comida, vacío o servido.', 'easy',
   array['plato','plato hondo','dish','plate'],
   array['Se ve una pieza de vajilla plana o poco profunda.',
         'Un bol profundo cuenta.'],
   'approved', now(), false),

  ('toothbrush', 'un cepillo de dientes', 'Un cepillo de dientes.', 'easy',
   array['cepillo de dientes','cepillo','toothbrush'],
   array['Se ve un mango alargado con cerdas en un extremo.',
         'Un cepillo de pelo no cuenta.'],
   'approved', now(), false),

  ('scissors', 'unas tijeras', 'Un par de tijeras.', 'medium',
   array['tijeras','tijera','scissors'],
   array['Se ven dos hojas cruzadas unidas por un eje, con anillos para los dedos.',
         'Las tijeras pueden estar cerradas.'],
   'approved', now(), false),

  ('umbrella', 'un paraguas', 'Un paraguas, abierto o cerrado.', 'medium',
   array['paraguas','sombrilla','umbrella'],
   array['Se ve una estructura plegable con tela y mango.',
         'Puede estar cerrado.'],
   'approved', now(), false),

  ('candle', 'una vela', 'Una vela, encendida o no.', 'medium',
   array['vela','velita','candle'],
   array['Se ve un cilindro o bloque de cera con mecha.',
         'No hace falta que esté encendida.'],
   'approved', now(), false),

  ('sock', 'una media', 'Una media o calcetín.', 'easy',
   array['media','medias','calcetín','soquete','sock'],
   array['Se ve una prenda tejida con forma de pie.',
         'Puede estar puesta.'],
   'approved', now(), false),

  ('bowl', 'un bol', 'Un bol o ensaladera.', 'easy',
   array['bol','bowl','ensaladera','tazón'],
   array['Se ve un recipiente redondo y hondo, de boca ancha.',
         'Un plato plano no cuenta.'],
   'approved', now(), false),

  ('notebook', 'un cuaderno', 'Un cuaderno o anotador.', 'easy',
   array['cuaderno','anotador','libreta','notebook','notepad'],
   array['Se ve un conjunto de hojas unidas por espiral, grapa o encuadernado.',
         'Una hoja suelta no cuenta.'],
   'approved', now(), false),

  ('fridge_magnet', 'un imán de heladera', 'Un imán pegado en la heladera.', 'hard',
   array['imán','iman','magnet','fridge magnet'],
   array['Se ve un objeto decorativo pequeño adherido a una superficie metálica.',
         'Debe estar visiblemente pegado o sostenido contra metal.'],
   'approved', now(), false),

  ('houseplant_pot', 'una maceta', 'Una maceta, con o sin planta.', 'medium',
   array['maceta','matera','pot','planter'],
   array['Se ve un recipiente pensado para contener tierra y plantas.',
         'Puede estar vacío.'],
   'approved', now(), false),

  ('door_handle', 'un picaporte', 'El picaporte o manija de una puerta.', 'medium',
   array['picaporte','manija','manija de puerta','door handle','doorknob'],
   array['Se ve el mecanismo de apertura de una puerta: manija, pomo o barral.',
         'La puerta sola sin picaporte visible no cuenta.'],
   'approved', now(), false),

  ('light_switch', 'una llave de luz', 'El interruptor de luz de la pared.', 'medium',
   array['llave de luz','interruptor','switch','light switch'],
   array['Se ve un interruptor montado en pared, con tecla o palanca.',
         'Un enchufe sin interruptor no cuenta.'],
   'approved', now(), false),

  ('stuffed_animal', 'un peluche', 'Un muñeco de peluche.', 'medium',
   array['peluche','muñeco','oso de peluche','stuffed animal','plush'],
   array['Se ve un juguete blando con forma de animal o personaje.',
         'Una almohada con forma no cuenta salvo que tenga rasgos de personaje.'],
   'approved', now(), false),

  ('wallet', 'una billetera', 'Una billetera o monedero.', 'medium',
   array['billetera','monedero','cartera','wallet'],
   array['Se ve un objeto plegable de cuero o tela para guardar tarjetas o dinero.',
         'IMPORTANTE: no se exige que se vea contenido; nunca pedir documentos ni tarjetas.'],
   'approved', now(), false),

  ('clothes_hanger', 'una percha', 'Una percha de ropa.', 'medium',
   array['percha','gancho','hanger','clothes hanger'],
   array['Se ve una estructura triangular con gancho, para colgar ropa.',
         'Puede tener ropa colgada.'],
   'approved', now(), false),

  ('roll_of_tape', 'una cinta adhesiva', 'Un rollo de cinta adhesiva.', 'hard',
   array['cinta','cinta adhesiva','scotch','tape','duct tape'],
   array['Se ve un rollo circular de cinta.',
         'Un rollo de papel higiénico no cuenta.'],
   'approved', now(), false),

  ('sunscreen', 'un protector solar', 'Un envase de protector solar o crema.', 'hard',
   array['protector solar','bloqueador','crema','sunscreen','lotion'],
   array['Se ve un envase de crema o loción, con etiqueta o forma característica.',
         'Un envase de bebida no cuenta.'],
   'approved', now(), false),

  ('calculator', 'una calculadora', 'Una calculadora física.', 'hard',
   array['calculadora','calculator'],
   array['Se ve un dispositivo con teclado numérico y visor.',
         'La app calculadora en un celular no cuenta.'],
   'approved', now(), false),

  ('bread', 'un pan', 'Un pan de cualquier tipo.', 'medium',
   array['pan','pancito','baguette','bread','toast'],
   array['Se ve pan horneado: pieza, rodaja o bollo.',
         'Una galletita dulce no cuenta.'],
   'approved', now(), false),

  ('fruit', 'una fruta', 'Cualquier fruta fresca.', 'easy',
   array['fruta','manzana','banana','naranja','fruit','apple'],
   array['Se ve al menos una fruta fresca reconocible.',
         'Una verdura no cuenta.',
         'Fruta en un envase cerrado cuenta si se ve la fruta.'],
   'approved', now(), false)
on conflict (object_name) do nothing;
