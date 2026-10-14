/**
 * Русский / узбекский (латиница) для всех сайтов RegLocation.
 *
 * Интерфейс написан на русском; при выборе узбекского видимый текст, подсказки (placeholder, title,
 * aria-label) и окна подтверждения переводятся по словарю. Новые и изменённые элементы
 * (обновления монитора, уведомления, ошибки сервера) переводятся автоматически через MutationObserver.
 * Меняющиеся фразы («401-xona», «13-oktabr», «… в 17:00») — шаблонами.
 * Файл одинаковый в обоих проектах (монитор и сайт учителя/директора).
 */
export type Lang = 'ru' | 'uz';
const KEY = 'rl.lang';

export function getLang(): Lang {
  try {
    return localStorage.getItem(KEY) === 'uz' ? 'uz' : 'ru';
  } catch {
    return 'ru';
  }
}

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* приватный режим */
  }
  location.reload();
}

const CYR = /[А-Яа-яЁё]/;

// ───────────────────────── Словарь ─────────────────────────
const UZ: Record<string, string> = {
  // Общие
  'Войти': 'Kirish',
  'Выйти': 'Chiqish',
  'Выйти из аккаунта': 'Akkauntdan chiqish',
  'Логин': 'Login',
  'Логин:': 'Login:',
  'Пароль': 'Parol',
  'Пароль:': 'Parol:',
  'Новый пароль': 'Yangi parol',
  'Текущий пароль': 'Joriy parol',
  'Подтверждение пароля': 'Parolni tasdiqlash',
  'Повторите новый пароль': 'Yangi parolni takrorlang',
  'Пароли не совпадают': 'Parollar mos kelmadi',
  'Сохранить': 'Saqlash',
  'Сохранить изменения': 'O‘zgarishlarni saqlash',
  'Изменения сохранены': 'O‘zgarishlar saqlandi',
  'Отмена': 'Bekor qilish',
  'Отменить': 'Bekor qilish',
  'Удалить': 'O‘chirish',
  'Удалить навсегда': 'Butunlay o‘chirish',
  'Редактировать': 'Tahrirlash',
  'Добавить': 'Qo‘shish',
  'Закрыть': 'Yopish',
  'Готово': 'Tayyor',
  'Назад': 'Orqaga',
  'Копировать': 'Nusxa olish',
  'Скопировано': 'Nusxa olindi',
  'Очистить': 'Tozalash',
  'Переименовать': 'Nomini o‘zgartirish',
  'Название': 'Nomi',
  'Название сохранено': 'Nomi saqlandi',
  'Действия': 'Amallar',
  'Статус': 'Holat',
  'Тип': 'Turi',
  'Тип изменён': 'Turi o‘zgartirildi',
  'Все': 'Hammasi',
  'Все действия': 'Barcha amallar',
  'Всего:': 'Jami:',
  'Ошибка': 'Xatolik',
  'нет': 'yo‘q',
  'из': 'dan',
  'в': 'soat',
  'ч': 'soat',
  'мин': 'daq',
  'мин.': 'daq.',
  'Меню': 'Menyu',
  'Профиль': 'Profil',
  'Мой аккаунт': 'Mening akkauntim',
  'Настройки': 'Sozlamalar',
  'Светлая тема': 'Yorug‘ mavzu',
  'Тёмная тема': 'Qorong‘i mavzu',
  'Показать ещё': 'Yana ko‘rsatish',
  'Записей нет': 'Yozuvlar yo‘q',
  'Никого не найдено': 'Hech kim topilmadi',
  'Измените поиск или фильтры': 'Qidiruv yoki filtrlarni o‘zgartiring',
  'Страница': 'Sahifa',
  'Система': 'Tizim',
  'Подключение…': 'Ulanmoqda…',
  'Переподключение…': 'Qayta ulanmoqda…',
  'Синхронизировано': 'Sinxronlangan',
  'Онлайн': 'Onlayn',
  'Нет связи': 'Aloqa yo‘q',
  'Сервер недоступен': 'Server mavjud emas',
  'Нет соединения с сервером. Проверьте интернет.': 'Server bilan aloqa yo‘q. Internetni tekshiring.',
  'Ошибка соединения с сервером': 'Server bilan ulanishda xatolik',
  'ТЕСТОВЫЙ РЕЖИМ': 'SINOV REJIMI',
  'Тестовый режим': 'Sinov rejimi',
  'Узбекский язык': 'O‘zbek tili',
  'Русский язык': 'Rus tili',
  'Английский язык': 'Ingliz tili',

  // Роли и люди
  'Директор': 'Direktor',
  'Директор (владелец)': 'Direktor (egasi)',
  'владелец': 'egasi',
  'Завуч': 'Zavuch',
  'Учитель': 'O‘qituvchi',
  'Учитель?': 'O‘qituvchi?',
  'Учителя': 'O‘qituvchilar',
  'учителей': 'o‘qituvchi',
  'Монитор': 'Monitor',
  'Ресепшен': 'Qabulxona',
  'Монитор ресепшена': 'Qabulxona monitori',
  'Кабинет директора': 'Direktor kabineti',
  'Кабинет учителя': 'O‘qituvchi kabineti',
  'Кабинет завуча': 'Zavuch xonasi',
  'Сайт учителя': 'O‘qituvchi sayti',

  // Предметы
  'Математика': 'Matematika',
  'Информатика': 'Informatika',
  'Физика': 'Fizika',
  'Химия': 'Kimyo',
  'Биология': 'Biologiya',
  'География': 'Geografiya',
  'История': 'Tarix',
  'Физкультура': 'Jismoniy tarbiya',
  'Робототехника': 'Robototexnika',

  // Присутствие
  'Я в школе': 'Men maktabdaman',
  'Выйти из школы': 'Maktabdan chiqish',
  'В школе': 'Maktabda',
  'в школе': 'maktabda',
  'Не в школе': 'Maktabda emas',
  'Сейчас в школе': 'Hozir maktabda',
  'Сейчас в школе никого нет': 'Hozir maktabda hech kim yo‘q',
  'Отмечено: вы в школе': 'Belgilandi: siz maktabdasiz',
  'Отмечено: вы вышли из школы': 'Belgilandi: siz maktabdan chiqdingiz',
  'Нажмите «Я в школе», когда придёте': 'Kelganingizda «Men maktabdaman» tugmasini bosing',
  'вышел(а) из школы': 'maktabdan chiqdi',
  'Присутствие: все': 'Davomat: hammasi',
  'Посещаемость': 'Davomat',
  'ещё не входил': 'hali kirmagan',

  // Учебный день и расписание
  'Урок': 'Dars',
  'урок': 'dars',
  'урок ·': 'dars ·',
  'урок в': 'dars soat',
  '-й урок': '-dars',
  '-й урок · до звонка': '-dars · qo‘ng‘iroqqacha',
  '-й урок начнётся в': '-dars boshlanadi soat',
  'Перемена': 'Tanaffus',
  'Перемена ·': 'Tanaffus ·',
  'Обед': 'Tushlik',
  'обед': 'tushlik',
  'Полдник': 'Tamaddi',
  'полдник': 'tamaddi',
  'Обед / полдник': 'Tushlik / tamaddi',
  'Питание (все присутствующие — в столовой)': 'Ovqatlanish (barcha kelganlar — oshxonada)',
  '— учителя в столовой': '— o‘qituvchilar oshxonada',
  '— все учителя в столовой · ещё': '— barcha o‘qituvchilar oshxonada · yana',
  'Идёт': 'Davom etmoqda',
  'Начался': 'Boshlandi',
  '· далее': '· keyin',
  '· через': '· keyin',
  'Учебный день завершён': 'O‘quv kuni tugadi',
  'Учебный день до': 'O‘quv kuni gacha',
  'Начало учебного дня': 'O‘quv kunining boshlanishi',
  'Автоматический выход (конец дня)': 'Avtomatik chiqish (kun oxiri)',
  'Все отметки «В школе» закрываются, повторная отметка — завтра': 'Barcha «Maktabda» belgilari yopiladi, qayta belgilash — ertaga',
  'Раньше этого времени кнопка «Я в школе» недоступна': 'Bu vaqtdan oldin «Men maktabdaman» tugmasi ishlamaydi',
  'Учебные дни': 'O‘quv kunlari',
  'До начала уроков': 'Darslar boshlanishidan oldin',
  'Уроки закончились': 'Darslar tugadi',
  'Выходной день': 'Dam olish kuni',
  'Сейчас нет урока': 'Hozir dars yo‘q',
  'Сегодня уроков больше нет': 'Bugun boshqa dars yo‘q',
  'Сегодня по расписанию уроков нет.': 'Bugun jadval bo‘yicha dars yo‘q.',
  'Следующий урок': 'Keyingi dars',
  'Уроки сегодня': 'Bugungi darslar',
  'Сейчас ведут уроки:': 'Hozir dars o‘tmoqda:',
  'Урок в классе': 'Sinfda dars',
  'Урок по расписанию': 'Jadval bo‘yicha dars',
  'По расписанию': 'Jadval bo‘yicha',
  'Свободное время': 'Bo‘sh vaqt',
  'Расписание': 'Dars jadvali',
  'Расписания': 'Dars jadvallari',
  'Расписание звонков': 'Qo‘ng‘iroqlar jadvali',
  'Расписание звонков сохранено': 'Qo‘ng‘iroqlar jadvali saqlandi',
  'Сохранить расписание звонков': 'Qo‘ng‘iroqlar jadvalini saqlash',
  'Добавить урок': 'Dars qo‘shish',
  'Удалить урок': 'Darsni o‘chirish',
  'Очистить урок': 'Darsni tozalash',
  'Класс': 'Sinf',
  'Класс,': 'Sinf,',
  'Классы': 'Sinflar',
  'Мои классы': 'Mening sinflarim',
  'Кабинет': 'Xona',
  'Кабинет,': 'Xona,',
  'Кабинеты': 'Xonalar',
  'Текущий кабинет': 'Joriy xona',
  'Рабочий кабинет': 'Ish xonasi',
  'Кабинет не найден в схеме': 'Xona sxemada topilmadi',
  'Где': 'Qayerda',
  'Назначено директором': 'Direktor tayinlagan',
  'Данные, назначенные директором': 'Direktor tayinlagan ma’lumotlar',
  'Перемещения': 'Ko‘chishlar',
  'Местоположение — расчётное, по расписанию и назначениям директора': 'Joylashuv — taxminiy, jadval va direktor tayinlovi bo‘yicha',
  'Местоположение на мониторе — расчётное, по расписанию и назначениям директора. GPS не используется. В 17:00 отметка автоматически снимается.':
    'Monitordagi joylashuv — taxminiy, jadval va direktor tayinlovi bo‘yicha. GPS ishlatilmaydi. Soat 17:00 da belgi avtomatik olib tashlanadi.',
  'Расчётное местоположение по расписанию, а не подтверждённое физическое нахождение': 'Jadval bo‘yicha taxminiy joylashuv, haqiqiy joy tasdiqlanmagan',

  // Дни недели
  'Понедельник': 'Dushanba',
  'Вторник': 'Seshanba',
  'Среда': 'Chorshanba',
  'Четверг': 'Payshanba',
  'Пятница': 'Juma',
  'Суббота': 'Shanba',
  'Воскресенье': 'Yakshanba',
  'Сегодня': 'Bugun',
  'Пн': 'Du',
  'Вт': 'Se',
  'Ср': 'Cho',
  'Чт': 'Pa',
  'Пт': 'Ju',
  'Сб': 'Sha',
  'Вс': 'Ya',

  // Школа, этажи, помещения
  'Школа': 'Maktab',
  'Столовая': 'Oshxona',
  'Столовая (зал)': 'Oshxona (zal)',
  'Обеденный зал': 'Ovqatlanish zali',
  'Кухня': 'Oshpazxona',
  'Учительская': 'O‘qituvchilar xonasi',
  'Бухгалтерия': 'Buxgalteriya',
  'Коридор': 'Yo‘lak',
  'Лестница': 'Zinapoya',
  'Лифт': 'Lift',
  'Туалет': 'Hojatxona',
  'Туалет М': 'Hojatxona (o‘g‘il)',
  'Туалет Ж': 'Hojatxona (qiz)',
  'Подсобка': 'Omborxona',
  'Стадион': 'Stadion',
  'Трибуна': 'Tribuna',
  'Раздевалка': 'Yechinish xonasi',
  'Вход': 'Kirish',
  'Спортзал': 'Sport zali',
  'Учебный кабинет': 'O‘quv xonasi',
  'Лаборатория / кружок': 'Laboratoriya / to‘garak',
  'Другое': 'Boshqa',
  'Помещение': 'Xona',
  'Этажи': 'Qavatlar',
  'Этажи и кабинеты': 'Qavatlar va xonalar',
  'Редактор школы': 'Maktab muharriri',
  'Загрузка схемы школы…': 'Maktab sxemasi yuklanmoqda…',
  'Новый этаж': 'Yangi qavat',
  'Добавить этаж': 'Qavat qo‘shish',
  'Удалить этаж': 'Qavatni o‘chirish',
  'Этаж добавлен': 'Qavat qo‘shildi',
  'Этаж переименован': 'Qavat nomi o‘zgartirildi',
  'Этаж удалён': 'Qavat o‘chirildi',
  'Номер этажа': 'Qavat raqami',
  'Размер этажа': 'Qavat o‘lchami',
  'Порядок этажей изменён': 'Qavatlar tartibi o‘zgartirildi',
  'Порядок этажей = порядок на мониторе сверху вниз.': 'Qavatlar tartibi = monitorda yuqoridan pastga tartib.',
  'Добавить помещение': 'Xona qo‘shish',
  'Удалить помещение': 'Xonani o‘chirish',
  'Помещение удалено': 'Xona o‘chirildi',
  'Помещение добавлено — перетащите его на нужное место': 'Xona qo‘shildi — uni kerakli joyga suring',
  'Помещение добавлено. Расположите его в «Редакторе школы».': 'Xona qo‘shildi. Uni «Maktab muharriri»da joylashtiring.',
  'Номер / код': 'Raqam / kod',
  'По нему сопоставляются кабинеты из расписаний (например, 404)': 'Jadvaldagi xonalar shu raqam bo‘yicha topiladi (masalan, 404)',
  'Нажмите на помещение, чтобы изменить его название, номер, тип или размер.': 'Nomi, raqami, turi yoki o‘lchamini o‘zgartirish uchun xonani bosing.',
  'Перетаскивайте помещения мышью, тяните за угол, чтобы изменить размер. Стрелки — точное смещение (Shift — шаг 10).':
    'Xonalarni sichqoncha bilan suring, o‘lchamini o‘zgartirish uchun burchagidan torting. Strelkalar — aniq siljitish (Shift — 10 qadam).',
  'Привязка к сетке': 'To‘rga bog‘lash',
  'Ширина': 'Kengligi',
  'Высота': 'Balandligi',
  'Шир.': 'Ken.',
  'Выс.': 'Bal.',
  'Выше': 'Yuqoriga',
  'Ниже': 'Pastga',
  'Сверху (над остальными)': 'Yuqorida (boshqalar ustida)',
  'Снизу': 'Pastda',
  'Планировка сохранена — монитор обновлён': 'Reja saqlandi — monitor yangilandi',
  'Есть несохранённые изменения. Нажмите «Сохранить изменения», чтобы они появились на мониторе.':
    'Saqlanmagan o‘zgarishlar bor. Monitorda ko‘rinishi uchun «O‘zgarishlarni saqlash» tugmasini bosing.',
  'Сначала сохраните или отмените изменения': 'Avval o‘zgarishlarni saqlang yoki bekor qiling',
  'Расположение на мониторе': 'Monitordagi joylashuv',
  'Удаление отменено': 'O‘chirish bekor qilindi',
  'в расписаниях:': 'jadvallarda:',

  // Вход и регистрация
  'Вход учителя': 'O‘qituvchi kirishi',
  'Вход директора': 'Direktor kirishi',
  'Вход в монитор': 'Monitorga kirish',
  'Регистрация директора': 'Direktorni ro‘yxatdan o‘tkazish',
  'Создание основного аккаунта директора. Выполняется один раз.': 'Direktorning asosiy akkauntini yaratish. Faqat bir marta bajariladi.',
  'Зарегистрироваться': 'Ro‘yxatdan o‘tish',
  'Имя': 'Ism',
  'Фамилия': 'Familiya',
  'Латинские буквы, цифры, точка, дефис': 'Lotin harflari, raqamlar, nuqta, chiziqcha',
  'Должен совпадать с email владельца, указанным при настройке хостинга': 'Xostingni sozlashda ko‘rsatilgan egasi email manziliga mos bo‘lishi kerak',
  'Не менее 10 символов, буквы и цифры': 'Kamida 10 ta belgi, harflar va raqamlar',
  'Код из письма': 'Xatdagi kod',
  'Подтвердить и войти': 'Tasdiqlash va kirish',
  'Изменить данные или отправить код заново': 'Ma’lumotlarni o‘zgartirish yoki kodni qayta yuborish',
  'Забыли пароль?': 'Parolni unutdingizmi?',
  'Восстановление доступа': 'Kirishni tiklash',
  'Укажите email директора. На него придёт одноразовый код.': 'Direktor email manzilini kiriting. Unga bir martalik kod keladi.',
  'Получить код': 'Kodni olish',
  'Перейти ко входу': 'Kirishga o‘tish',
  'Пароль изменён. Все прежние сеансы завершены. Войдите с новым паролем.': 'Parol o‘zgartirildi. Barcha oldingi seanslar yakunlandi. Yangi parol bilan kiring.',
  'Пароль изменён. Другие сеансы завершены.': 'Parol o‘zgartirildi. Boshqa seanslar yakunlandi.',
  'Сменить пароль': 'Parolni o‘zgartirish',
  'Логин и пароль выдаёт директор школы.': 'Login va parolni maktab direktori beradi.',
  'Самостоятельной регистрации нет. Забыли пароль — обратитесь к директору.': 'Mustaqil ro‘yxatdan o‘tish yo‘q. Parolni unutgan bo‘lsangiz — direktorga murojaat qiling.',
  'Учётную запись выдаёт директор в разделе «Доступ к монитору».': 'Hisobni direktor «Monitorga kirish» bo‘limida beradi.',
  'Выйти из монитора?': 'Monitordan chiqasizmi?',
  'Очень слабый': 'Juda zaif',
  'Слабый': 'Zaif',
  'Средний': 'O‘rtacha',
  'Хороший': 'Yaxshi',
  'Надёжный': 'Ishonchli',
  'Отличный': 'A’lo',

  // Кабинет учителя
  'Пароль выдаёт и меняет директор. Если забыли пароль или хотите новый — обратитесь к директору.':
    'Parolni direktor beradi va o‘zgartiradi. Parolni unutgan bo‘lsangiz yoki yangisi kerak bo‘lsa — direktorga murojaat qiling.',
  'Изменить предмет, роль или классы может только директор.': 'Fan, rol yoki sinflarni faqat direktor o‘zgartira oladi.',
  'Изменить фото': 'Rasmni o‘zgartirish',
  'Сменить фото': 'Rasmni almashtirish',
  'Загрузить фото': 'Rasm yuklash',
  'Фото удалено': 'Rasm o‘chirildi',
  'Фотография обновлена': 'Rasm yangilandi',
  'Фото больше 15 МБ': 'Rasm 15 MB dan katta',
  'Выберите фотографию (JPG, PNG, HEIC, WEBP)': 'Rasm tanlang (JPG, PNG, HEIC, WEBP)',
  'Загрузить расписание': 'Dars jadvalini yuklash',
  'Загрузите фото или PDF своего расписания — система найдёт классы (белые ячейки) и кабинеты (оранжевые ячейки). Проверьте результат и сохраните.':
    'Dars jadvalingizning rasmi yoki PDF faylini yuklang — tizim sinflarni (oq kataklar) va xonalarni (to‘q sariq kataklar) topadi. Natijani tekshirib, saqlang.',

  // Загрузка и распознавание расписания
  'Загрузить фото или PDF расписания': 'Dars jadvali rasmi yoki PDF faylini yuklash',
  'Распознаём расписание…': 'Dars jadvali aniqlanmoqda…',
  'Ищем таблицу, дни недели, классы и кабинеты. Обычно 5–30 секунд.': 'Jadval, hafta kunlari, sinflar va xonalar qidirilmoqda. Odatda 5–30 soniya.',
  'Результат можно проверить и исправить перед сохранением.':
    'Natijani saqlashdan oldin tekshirib, tuzatish mumkin.',
  'Выбрать файл': 'Fayl tanlash',
  '(текст взят из PDF)': '(matn PDF dan olindi)',
  'Все значения прочитаны уверенно, но всё равно сверьте с оригиналом.': 'Barcha qiymatlar ishonchli o‘qildi, baribir asl nusxa bilan solishtiring.',
  '— распознавание неуверенное или кабинет не найден в базе.': '— aniqlash ishonchsiz yoki xona bazada topilmadi.',
  'Исходный документ (нажмите на ячейку в таблице — она подсветится здесь)': 'Asl hujjat (jadvaldagi katakni bosing — u shu yerda belgilanadi)',
  'Проверьте': 'Tekshiring',
  'Проверьте по оригиналу': 'Asl nusxa bilan tekshiring',
  'Готово к сохранению': 'Saqlashga tayyor',
  'Подтвердить и сохранить': 'Tasdiqlash va saqlash',
  'Автоматическое распознавание не гарантирует 100% точности.': 'Avtomatik aniqlash 100% aniqlikni kafolatlamaydi.',
  'Til / Язык': 'Til',
  'Файл слишком большой. Уменьшите его или сохраните как JPG/PDF меньшего размера.': 'Fayl juda katta. Uni kichraytiring yoki kichikroq JPG/PDF sifatida saqlang.',
  'Файл больше': 'Fayl hajmi',
  'МБ. Сделайте скриншот или сохраните расписание как JPG/PDF меньшего размера.': 'MB dan katta. Skrinshot oling yoki jadvalni kichikroq JPG/PDF sifatida saqlang.',

  // Кабинет директора: учителя
  'Добавить учителя': 'O‘qituvchi qo‘shish',
  'Редактирование учителя': 'O‘qituvchini tahrirlash',
  'Удалить учителя?': 'O‘qituvchini o‘chirasizmi?',
  'Учитель удалён': 'O‘qituvchi o‘chirildi',
  'Учителей пока нет': 'Hozircha o‘qituvchilar yo‘q',
  'Создайте первый аккаунт учителя': 'Birinchi o‘qituvchi akkauntini yarating',
  'Поиск: ФИО, логин, предмет': 'Qidiruv: F.I.Sh., login, fan',
  'Поиск: ФИО, предмет, класс, кабинет': 'Qidiruv: F.I.Sh., fan, sinf, xona',
  'Предмет / должность': 'Fan / lavozim',
  'Предмет или должность': 'Fan yoki lavozim',
  'Например: Математика, Английский язык, Завуч': 'Masalan: Matematika, Ingliz tili, Zavuch',
  'Завуч — в кабинете завуча (кроме обеда и полдника), учитель — по расписанию': 'Zavuch — zavuch xonasida (tushlik va tamaddidan tashqari), o‘qituvchi — jadval bo‘yicha',
  'Роль': 'Rol',
  'Роль на карте': 'Xaritadagi rol',
  'Определить по должности': 'Lavozim bo‘yicha aniqlash',
  'Директор — всегда в кабинете директора, завуч — в кабинете завуча (кроме обеда и полдника)':
    'Direktor — doim direktor kabinetida, zavuch — zavuch xonasida (tushlik va tamaddidan tashqari)',
  'Создать аккаунт': 'Akkaunt yaratish',
  'Аккаунт создан:': 'Akkaunt yaratildi:',
  'Аккаунт:': 'Akkaunt:',
  'Логин и надёжный пароль создаются автоматически.': 'Login va ishonchli parol avtomatik yaratiladi.',
  'Логин формируется из фамилии и имени латиницей (например,': 'Login familiya va ismdan lotin harflarida tuziladi (masalan,',
  '). Пароль — 14 случайных символов, созданных криптографически стойким генератором. Посмотреть его позже можно кнопкой «Логин и пароль».':
    '). Parol — kriptografik ishonchli generator yaratgan 14 ta tasodifiy belgi. Uni keyinroq «Login va parol» tugmasi orqali ko‘rish mumkin.',
  'Учитель входит на сайт по адресу': 'O‘qituvchi saytga quyidagi manzil orqali kiradi',
  'с телефона, загружает своё расписание и отмечает «Я в школе».': 'telefondan, dars jadvalini yuklaydi va «Men maktabdaman» deb belgilaydi.',
  'Посмотреть логин и пароль позже можно кнопкой «Логин и пароль» в списке учителей.': 'Login va parolni keyinroq o‘qituvchilar ro‘yxatidagi «Login va parol» tugmasi orqali ko‘rish mumkin.',
  'Логин и пароль': 'Login va parol',
  'Логин и пароль одной строкой': 'Login va parol bitta qatorda',
  'Выдать новый пароль': 'Yangi parol berish',
  'Выдать новый пароль? Старый перестанет работать.': 'Yangi parol berilsinmi? Eskisi ishlamay qoladi.',
  'Пароль этого аккаунта выдан раньше и не сохранён. Выдайте новый пароль — старый перестанет работать.':
    'Bu akkaunt paroli avvalroq berilgan va saqlanmagan. Yangi parol bering — eskisi ishlamay qoladi.',
  'Передайте логин и пароль сотруднику лично. Посмотреть их снова можно кнопкой «Логин и пароль».':
    'Login va parolni xodimga shaxsan bering. Ularni qayta «Login va parol» tugmasi orqali ko‘rish mumkin.',
  'Активен': 'Faol',
  'Заблокирован': 'Bloklangan',
  'Заблокировать': 'Bloklash',
  'Разблокировать': 'Blokdan chiqarish',
  'Архив': 'Arxiv',

  // Доступ к монитору
  'Доступ к монитору': 'Monitorga kirish',
  'Создать доступ': 'Kirish yaratish',
  'Новый доступ к монитору': 'Monitorga yangi kirish',
  'Доступов к монитору пока нет': 'Hozircha monitorga kirishlar yo‘q',
  'Создайте учётную запись для сотрудника ресепшена': 'Qabulxona xodimi uchun hisob yarating',
  'Отдельные учётные записи для экрана ресепшена. Они могут только просматривать монитор.':
    'Qabulxona ekrani uchun alohida hisoblar. Ular faqat monitorni ko‘ra oladi.',
  'Например: Ресепшен 1 этаж, Экран в холле': 'Masalan: Qabulxona 1-qavat, Zaldagi ekran',
  'Сгенерировать логин и пароль': 'Login va parol yaratish',
  'Данные для входа в монитор': 'Monitorga kirish ma’lumotlari',
  'Завершить сеансы': 'Seanslarni yakunlash',
  'Сеансы завершены': 'Seanslar yakunlandi',
  'Доступ заблокирован': 'Kirish bloklandi',
  'Доступ разблокирован': 'Kirish blokdan chiqarildi',
  'Доступ удалён': 'Kirish o‘chirildi',
  'На компьютере ресепшена откройте адрес монитора (': 'Qabulxona kompyuterida monitor manzilini oching (',
  '), введите логин и пароль. Сеанс монитора длится до 90 дней — повторно входить каждый день не нужно.':
    '), login va parolni kiriting. Monitor seansi 90 kungacha davom etadi — har kuni qayta kirish shart emas.',
  '· активных:': '· faol:',

  // История и настройки
  'История изменений': 'O‘zgarishlar tarixi',
  'Кто, когда и что изменил. Записи нельзя удалить.': 'Kim, qachon va nimani o‘zgartirgan. Yozuvlarni o‘chirib bo‘lmaydi.',
  'Поиск по описанию или автору': 'Tavsif yoki muallif bo‘yicha qidiruv',
  'Логотип школы': 'Maktab logotipi',
  'Загрузить логотип': 'Logotip yuklash',
  'Вернуть стандартный': 'Standartini qaytarish',
  'Логотип обновлён на всех экранах': 'Logotip barcha ekranlarda yangilandi',
  'Используется оригинальное изображение без изменений, углы скругляются на экране. PNG, JPG, WEBP или HEIC, квадратное.':
    'Asl rasm o‘zgarishsiz ishlatiladi, burchaklari ekranda yumaloqlanadi. PNG, JPG, WEBP yoki HEIC, kvadrat.',
  'Часовой пояс': 'Vaqt mintaqasi',
  'Хранилище файлов': 'Fayllar ombori',
  'База данных PostgreSQL': 'PostgreSQL ma’lumotlar bazasi',
  'Объектное хранилище S3': 'S3 obyekt ombori',
  'Почта (коды подтверждения)': 'Pochta (tasdiqlash kodlari)',
  'настроена': 'sozlangan',
  'не настроена': 'sozlanmagan',
  'Без почты не будет работать восстановление пароля директора. Настройте SMTP в переменных окружения сервера.':
    'Pochtasiz direktor parolini tiklash ishlamaydi. Server muhit o‘zgaruvchilarida SMTP ni sozlang.',
  'Языки распознавания': 'Aniqlash tillari',

  // Монитор
  'Показать список учителей': 'O‘qituvchilar ro‘yxatini ko‘rsatish',
  'Скрыть список учителей': 'O‘qituvchilar ro‘yxatini yashirish',
  'Нажмите на учителя в списке справа, чтобы найти его на схеме': 'Sxemada topish uchun o‘ng tomondagi ro‘yxatdan o‘qituvchini bosing',

  // Сообщения сервера (ошибки и подсказки)
  'Неверный логин или пароль': 'Login yoki parol noto‘g‘ri',
  'Слишком много попыток входа. Попробуйте позже.': 'Kirishga urinishlar juda ko‘p. Keyinroq urinib ko‘ring.',
  'Аккаунт заблокирован. Обратитесь к директору.': 'Akkaunt bloklangan. Direktorga murojaat qiling.',
  'Аккаунт заблокирован': 'Akkaunt bloklangan',
  'Аккаунт в архиве.': 'Akkaunt arxivda.',
  'Аккаунт учителя неактивен': 'O‘qituvchi akkaunti faol emas',
  'Требуется вход в систему': 'Tizimga kirish talab qilinadi',
  'Недостаточно прав': 'Huquqlar yetarli emas',
  'Не найдено': 'Topilmadi',
  'Внутренняя ошибка сервера': 'Serverning ichki xatosi',
  'Некорректные данные': 'Noto‘g‘ri ma’lumotlar',
  'Неверный или просроченный код': 'Kod noto‘g‘ri yoki muddati o‘tgan',
  'Код — 6 цифр': 'Kod — 6 ta raqam',
  'Превышено число попыток. Запросите новый код.': 'Urinishlar soni oshib ketdi. Yangi kod so‘rang.',
  'Слишком много запросов кода. Попробуйте через час.': 'Kod so‘rovlari juda ko‘p. Bir soatdan keyin urinib ko‘ring.',
  'Аккаунт директора уже создан. Используйте вход директора.': 'Direktor akkaunti allaqachon yaratilgan. Direktor kirishidan foydalaning.',
  'Аккаунт директора уже создан.': 'Direktor akkaunti allaqachon yaratilgan.',
  'Введите корректный email': 'To‘g‘ri email kiriting',
  'Введите имя': 'Ismni kiriting',
  'Введите фамилию': 'Familiyani kiriting',
  'Введите логин': 'Loginni kiriting',
  'Введите пароль': 'Parolni kiriting',
  'Введите название': 'Nomini kiriting',
  'Введите текущий пароль': 'Joriy parolni kiriting',
  'Текущий пароль указан неверно': 'Joriy parol noto‘g‘ri',
  'Пароль должен содержать не менее 10 символов': 'Parol kamida 10 ta belgidan iborat bo‘lishi kerak',
  'Пароль должен содержать буквы и цифры': 'Parolda harflar va raqamlar bo‘lishi kerak',
  'Пароль слишком длинный': 'Parol juda uzun',
  'Логин — минимум 3 символа': 'Login — kamida 3 ta belgi',
  'Логин: только латинские буквы, цифры, точка, дефис и подчёркивание': 'Login: faqat lotin harflari, raqamlar, nuqta, chiziqcha va pastki chiziq',
  'Этот логин уже занят': 'Bu login band',
  'Email владельца изменён. Начните регистрацию заново.': 'Egasining email manzili o‘zgartirildi. Ro‘yxatdan o‘tishni qaytadan boshlang.',
  'Регистрация недоступна: не настроен почтовый сервис.': 'Ro‘yxatdan o‘tish mavjud emas: pochta xizmati sozlanmagan.',
  'Регистрация недоступна: администратор хостинга не указал email владельца.': 'Ro‘yxatdan o‘tish mavjud emas: xosting administratori egasining email manzilini ko‘rsatmagan.',
  'Если этот email указан как email владельца, на него отправлен код подтверждения.': 'Agar bu email egasining manzili bo‘lsa, unga tasdiqlash kodi yuborildi.',
  'Если директор с таким email существует, на него отправлен код восстановления.': 'Agar shu emailga ega direktor mavjud bo‘lsa, unga tiklash kodi yuborildi.',
  'Не удалось отправить письмо с кодом. Повторите попытку через минуту.': 'Kodli xatni yuborib bo‘lmadi. Bir daqiqadan keyin qayta urinib ko‘ring.',
  'Не удалось отправить письмо: почта сайта не настроена (неверный или отсутствующий SMTP_PASS — пароль приложения). Сообщите администратору сайта.':
    'Xatni yuborib bo‘lmadi: sayt pochtasi sozlanmagan (SMTP_PASS — ilova paroli noto‘g‘ri yoki yo‘q). Sayt administratoriga xabar bering.',
  'Недействительный CSRF-токен. Обновите страницу.': 'CSRF token yaroqsiz. Sahifani yangilang.',
  'Запрос с недопустимого источника': 'So‘rov ruxsat etilmagan manbadan',
  'Пароль учителя может изменить только директор': 'O‘qituvchi parolini faqat direktor o‘zgartira oladi',
  'Сегодня выходной. Отметка доступна в учебные дни.': 'Bugun dam olish kuni. Belgilash o‘quv kunlarida mumkin.',
  'Учитель не найден': 'O‘qituvchi topilmadi',
  'Профиль учителя не найден': 'O‘qituvchi profili topilmadi',
  'Помещение не найдено': 'Xona topilmadi',
  'Этаж не найден': 'Qavat topilmadi',
  'Здание не найдено': 'Bino topilmadi',
  'Аккаунт монитора не найден': 'Monitor akkaunti topilmadi',
  'Укажите предмет или должность': 'Fan yoki lavozimni kiriting',
  'Укажите класс': 'Sinfni kiriting',
  'Укажите кабинет': 'Xonani kiriting',
  'Файл не выбран': 'Fayl tanlanmagan',
  'Файл слишком большой': 'Fayl juda katta',
  'Не удалось обработать изображение': 'Rasmni qayta ishlab bo‘lmadi',
  'Занятия не найдены. Заполните расписание вручную.': 'Darslar topilmadi. Jadvalni qo‘lda to‘ldiring.',
  'Класс не найден — укажите вручную': 'Sinf topilmadi — qo‘lda kiriting',
  'Номер кабинета не распознан': 'Xona raqami aniqlanmadi',
  'Номер кабинета не распознан — укажите вручную': 'Xona raqami aniqlanmadi — qo‘lda kiriting',
  'Конец учебного дня должен быть позже начала': 'O‘quv kuni oxiri boshlanishidan keyin bo‘lishi kerak',
  'Неподдерживаемый формат файла. Загрузите PDF или изображение (PNG, JPG, HEIC, WEBP, TIFF, BMP, GIF).':
    'Fayl formati qo‘llab-quvvatlanmaydi. PDF yoki rasm yuklang (PNG, JPG, HEIC, WEBP, TIFF, BMP, GIF).',
};

/** Слова внутри фраз: дни недели и месяцы (например, в дате на мониторе). */
const WORDS: Record<string, string> = {
  'Понедельник': 'Dushanba', 'Вторник': 'Seshanba', 'Среда': 'Chorshanba', 'Четверг': 'Payshanba', 'Пятница': 'Juma', 'Суббота': 'Shanba', 'Воскресенье': 'Yakshanba',
  'января': 'yanvar', 'февраля': 'fevral', 'марта': 'mart', 'апреля': 'aprel', 'мая': 'may', 'июня': 'iyun',
  'июля': 'iyul', 'августа': 'avgust', 'сентября': 'sentabr', 'октября': 'oktabr', 'ноября': 'noyabr', 'декабря': 'dekabr',
};

/** Меняющиеся фразы (с номерами, временем, названиями). */
const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Кабинет (\S+)$/, (m) => `${m[1]}-xona`],
  [/^Каб\. (\S+)$/, (m) => `${m[1]}-xona`],
  [/^(-?\d+) этаж$/, (m) => `${m[1]}-qavat`],
  [/^(\d+) урок$/, (m) => `${m[1]}-dars`],
  [/^(\d+) урок · (.+)$/, (m) => `${m[1]}-dars · ${m[2]}`],
  [/^Sport zal (\d+)$/i, (m) => `Sport zali ${m[1]}`],
  [/^Спортзал (\d+)$/, (m) => `Sport zali ${m[1]}`],
  [/^(Понедельник|Вторник|Среда|Четверг|Пятница|Суббота|Воскресенье), (\d+) (\S+) (\d{4})$/, (m) => `${WORDS[m[1]!]}, ${m[2]}-${WORDS[m[3]!] ?? m[3]} ${m[4]}`],
  [/^(\d+) (января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)$/, (m) => `${m[1]}-${WORDS[m[2]!]}`],
  [/^Учебный день ещё не начался\. Отметка доступна с (\d\d:\d\d)\.$/, (m) => `O‘quv kuni hali boshlanmadi. Belgilash soat ${m[1]} dan mumkin.`],
  [/^Учебный день завершён в (\d\d:\d\d)\. Отметка будет доступна завтра\.$/, (m) => `O‘quv kuni soat ${m[1]} da tugadi. Belgilash ertaga mumkin bo‘ladi.`],
  [/^Учебный день до (\d\d:\d\d)$/, (m) => `O‘quv kuni soat ${m[1]} gacha`],
  [/^В школе с (\d\d:\d\d)$/, (m) => `Soat ${m[1]} dan maktabda`],
  [/^● В школе с (\d\d:\d\d)$/, (m) => `● Soat ${m[1]} dan maktabda`],
  [/^Обед в (\d\d:\d\d)(.*)$/, (m) => `Tushlik soat ${m[1]} da${translateTail(m[2]!)}`],
  [/^Полдник в (\d\d:\d\d)(.*)$/, (m) => `Tamaddi soat ${m[1]} da${translateTail(m[2]!)}`],
  [/^через (\d+) ч (\d+) мин$/, (m) => `${m[1]} soat ${m[2]} daqiqadan keyin`],
  [/^через (\d+) мин$/, (m) => `${m[1]} daqiqadan keyin`],
  [/^Идёт (\d+)-й урок · до звонка (\d+) мин$/, (m) => `${m[1]}-dars davom etmoqda · qo‘ng‘iroqqacha ${m[2]} daq`],
  [/^В школе (\d+) из (\d+) учителей$/, (m) => `Maktabda ${m[2]} ta o‘qituvchidan ${m[1]} tasi`],
  [/^Урок в классе (.+)$/, (m) => `${m[1]} sinfida dars`],
  [/^Монитор «(.+)»$/, (m) => `«${m[1]}» monitori`],
  [/^Удалить доступ «(.+)»\?$/, (m) => `«${m[1]}» kirishi o‘chirilsinmi?`],
  [/^(.+) вышел\(а\) из школы$/, (m) => `${m[1]} maktabdan chiqdi`],
  [/^(.+) в школе$/, (m) => `${m[1]} maktabda`],
  [/^Кабинет «(.+)» не найден в схеме школы — выберите из списка$/, (m) => `«${m[1]}» xonasi maktab sxemasida topilmadi — ro‘yxatdan tanlang`],
  [/^Класс «(.+)» прочитан неуверенно — сверьте с оригиналом$/, (m) => `«${m[1]}» sinfi ishonchsiz o‘qildi — asl nusxa bilan solishtiring`],
  [/^Исправлено OCR: (.+)$/, (m) => `OCR tuzatdi: ${m[1]}`],
  [/^Не похоже на класс: (.+)$/, (m) => `Sinfga o‘xshamaydi: ${m[1]}`],
  [/^Кабинет (\S+) не найден в базе помещений$/, (m) => `${m[1]}-xona bazada topilmadi`],
  [/^Распознано уроков: (\d+)\. Проверьте отмеченные: (\d+)$/, (m) => `Aniqlangan darslar: ${m[1]}. Belgilanganlarni tekshiring: ${m[2]}`],
  [/^Распознано уроков: (\d+)$/, (m) => `Aniqlangan darslar: ${m[1]}`],
  [/^Уроков: (\d+)$/, (m) => `Darslar: ${m[1]}`],
  [/^Проверить: (\d+)$/, (m) => `Tekshirish: ${m[1]}`],
  [/^Предварительный результат: (\d+) уроков(.*)$/, (m) => `Dastlabki natija: ${m[1]} ta dars${translateTail(m[2]!)}`],
  [/^Не удалось открыть файл (\S+): (.+)$/, (m) => `${m[1]} faylini ochib bo‘lmadi. Jadvalni PDF, PNG yoki JPG sifatida saqlab, qayta yuklang.`],
  [/^Неподдерживаемый формат\. Допустимо: (.+)$/, (m) => `Format qo‘llab-quvvatlanmaydi. Ruxsat etilgan: ${m[1]}`],
  [/^Слишком много неудачных попыток\. Повторите через (\d+) мин\.?$/, (m) => `Muvaffaqiyatsiz urinishlar juda ko‘p. ${m[1]} daqiqadan keyin qayta urinib ko‘ring.`],
  [/^Всего: (\d+) · активных: (\d+)$/, (m) => `Jami: ${m[1]} · faol: ${m[2]}`],
  [/^Всего: (\d+) · в школе: (\d+)$/, (m) => `Jami: ${m[1]} · maktabda: ${m[2]}`],
  [/^Последний вход: (.+) · активных сеансов: (\d+)$/, (m) => `Oxirgi kirish: ${m[1]} · faol seanslar: ${m[2]}`],
  [/^(.+) · вход: (.+)$/, (m) => `${m[1]} · kirish: ${translateTail(m[2]!).trim()}`],
  [/^Действует с (.+)$/, (m) => `${m[1]} dan amal qiladi`],
  [/^(\d+) ур\.$/, (m) => `${m[1]} dars`],
  [/^далее (\d+) урок$/, (m) => `keyin ${m[1]}-dars`],
  [/^Активные \((\d+)\)$/, (m) => `Faol (${m[1]})`],
  [/^Заблокированные \((\d+)\)$/, (m) => `Bloklangan (${m[1]})`],
  [/^Архив \((\d+)\)$/, (m) => `Arxiv (${m[1]})`],
  [/^· вход:$/, () => '· kirish:'],
  [/^вход:$/, () => 'kirish:'],
  [/^ур\.$/, () => 'dars'],
  [/^Логин: (\S+)\s+Пароль: (\S+)$/, (m) => `Login: ${m[1]}\nParol: ${m[2]}`],
  [/^Проверьте (\d+) отмеченн(?:ую ячейку|ых ячеек) — распознавание неуверенное или кабинет не найден в базе\.$/, (m) => `${m[1]} ta belgilangan katakni tekshiring — aniqlash ishonchsiz yoki xona bazada topilmadi.`],
  [/^Удалить «(.+)» со всеми помещениями\?([\s\S]*)$/, (m) => `«${m[1]}» barcha xonalari bilan o‘chirilsinmi?${tail(m[2]!)}`],
  [/^Удалить «(.+)»\?([\s\S]*)$/, (m) => `«${m[1]}» o‘chirilsinmi?${tail(m[2]!)}`],
  [/^Продолжить удаление\?$/, () => 'O‘chirish davom ettirilsinmi?'],
  [/^Удалить всё равно\? Уроки останутся в расписании без привязки к кабинету\.$/, () => 'Baribir o‘chirilsinmi? Darslar jadvalda xonaga bog‘lanmagan holda qoladi.'],
  [/^Кабинет прочитан неуверенно(?: \(«(.+)»\))? — подставлен (\S+), как в большинстве уроков\. Проверьте$/, (m) => `Xona ishonchsiz o‘qildi${m[1] ? ` («${m[1]}»)` : ''} — ko‘pchilik darslardagidek ${m[2]}-xona qo‘yildi. Tekshiring`],
  [/^Код: (\S+)$/, (m) => `Kod: ${m[1]}`],
];

/** Хвост составного сообщения (после пустой строки) — переводится отдельно. */
function tail(s: string): string {
  const t = s.trim();
  return t ? `\n\n${lookup(t) ?? t}` : '';
}

function translateTail(s: string): string {
  if (!s) return '';
  const lead = s.match(/^\s*(·\s*)?/)![0];
  const rest = s.slice(lead.length);
  return lead + (lookup(rest) ?? rest);
}

const WORD_RE = new RegExp(`(${Object.keys(WORDS).join('|')})`, 'g');

/** Перевод фразы целиком; null — перевода нет. */
export function lookup(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || !CYR.test(t)) return null;
  const exact = UZ[t];
  if (exact !== undefined) return exact;
  for (const [re, fn] of PATTERNS) {
    const m = t.match(re);
    if (m) return fn(m);
  }
  // Составные фразы «A · B» переводим по частям
  if (t.includes(' · ')) {
    const parts = t.split(' · ').map((p) => lookup(p) ?? (CYR.test(p) ? null : p));
    if (parts.every((p) => p !== null)) return parts.join(' · ');
  }
  const words = t.replace(WORD_RE, (w) => WORDS[w] ?? w);
  return words !== t ? words : null;
}

/** Перевод строки для текущего языка (для confirm/alert и программных сообщений). */
export function tr(text: string): string {
  return getLang() === 'uz' ? lookup(text) ?? text : text;
}

// ───────────────────────── Перевод страницы ─────────────────────────
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'NOSCRIPT']);

function translateTextNode(node: Text) {
  const v = node.nodeValue;
  if (!v || !CYR.test(v)) return;
  const parent = node.parentElement;
  if (!parent || SKIP.has(parent.tagName) || parent.closest('[data-no-i18n],[contenteditable="true"]')) return;
  const out = lookup(v);
  if (out === null) return;
  const lead = v.match(/^\s*/)![0];
  const trail = v.match(/\s*$/)![0];
  node.nodeValue = lead + out + trail;
}

function translateElement(el: Element) {
  if (el.closest('[data-no-i18n]')) return;
  // Подсказки поля ввода (<datalist>): показывается значение варианта — переводим его
  if (el.tagName === 'OPTION' && el.parentElement?.tagName === 'DATALIST') {
    const v = el.getAttribute('value');
    const out = v && CYR.test(v) ? lookup(v) : null;
    if (out !== null) el.setAttribute('value', out);
  }
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && CYR.test(v)) {
      const out = lookup(v);
      if (out !== null) el.setAttribute(a, out);
    }
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return translateTextNode(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (SKIP.has(el.tagName)) {
    translateElement(el); // у полей ввода переводим только подсказки
    return;
  }
  translateElement(el);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) translateTextNode(n as Text);
    else translateElement(n as Element);
  }
}

let started = false;

/** Включить перевод страницы (вызывается один раз при запуске сайта). */
export function startI18n() {
  const lang = getLang();
  document.documentElement.lang = lang === 'uz' ? 'uz' : 'ru';
  if (lang !== 'uz' || started) return;
  started = true;
  // Окна подтверждения браузера — тоже на узбекском
  const confirm0 = window.confirm.bind(window);
  const alert0 = window.alert.bind(window);
  window.confirm = (m?: string) => confirm0(m ? tr(m) : m);
  window.alert = (m?: string) => alert0(m ? tr(m) : m);
  const run = () => {
    translateTree(document.body);
    if (CYR.test(document.title)) document.title = document.title.replace(WORD_RE, (w) => WORDS[w] ?? w).replace(/Монитор/g, 'Monitor').replace(/Кабинет директора/g, 'Direktor kabineti').replace(/Кабинет учителя/g, 'O‘qituvchi kabineti');
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') translateTextNode(m.target as Text);
        else if (m.type === 'attributes') translateElement(m.target as Element);
        else m.addedNodes.forEach((n) => translateTree(n));
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  };
  if (document.body) run();
  else document.addEventListener('DOMContentLoaded', run, { once: true });
}
