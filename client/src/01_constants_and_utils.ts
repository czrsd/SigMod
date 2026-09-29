(() => {
    'use strict';
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // ~ Shared configuration, contracts and default settings                              ~
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    const SIGMOD_DEV = {
        enabled: false,
        cssUrl: 'http://localhost:8787/sigmod.css',
        productionCssUrl: 'https://czrsd.com/static/sigmod/v11/sigmod.css',
        localeUrl: 'http://localhost:8787/locales',
        productionLocaleUrl: 'https://czrsd.com/static/sigmod/v11/locales',
    };
    const BUILD = {
        version: 11,
        release: '11.0.0',
        serverVersion: '5.0.0',
        settingsVersion: 3,
    };
    const STORAGE = {
        settings: 'SigModClient-settings',
        settingsBackupPrefix: 'SigModClient-settings-backup',
        gameSettings: 'settings',
        gameLogin: 'save',
        hiddenAlerts: 'hide-alert',
        stats: 'game-stats',
        statsHistory: 'game-stats-history',
        statsDatabase: 'SigModStatisticsDB',
        statsMatchStore: 'matches',
        statsMetaStore: 'meta',
        galleryDatabase: 'imageGalleryDB',
        galleryStore: 'images',
        galleryMetaStore: 'imageMeta',
        recentTabs: 'SigModClient-recent-tabs',
        friendsLocal: 'SigModClient-friends-local',
        localization: 'SigModClient-localization',
    };
    const ENDPOINTS = {
        app: 'https://mod.czrsd.com/api/v5',
        socket: 'wss://mod.czrsd.com/ws',
        blockedChat: 'https://mod.czrsd.com/spam.json',
        headerAnimation: 'https://czrsd.com/static/sigmod/sigmodclient.gif',
        discordAuth:
            'https://discord.com/oauth2/authorize?client_id=1067097357780516874&response_type=code&redirect_uri=https%3A%2F%2Fmod.czrsd.com%2Fapi%2Fv5%2Fdiscord%2Fcallback&scope=identify',
    };
    const LIBRARIES = {
        chart: {
            script: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
            global: 'Chart',
        },
        colorPicker: {
            script: 'https://unpkg.com/alwan@2.2.0/dist/js/alwan.min.js',
            style: 'https://unpkg.com/alwan@2.2.0/dist/css/alwan.min.css',
            global: 'Alwan',
        },
        jszip: {
            script: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
            global: 'JSZip',
        },
    };

    /** @type {Readonly<Record<string, { viewBox: string, content: string }>>} */
    const ICONS = {
        close: {
            viewBox: '0 0 1024 1024',
            content:
                '<path fill="currentColor" d="M764.288 214.592 512 466.88 259.712 214.592a31.936 31.936 0 0 0-45.12 45.12L466.752 512 214.528 764.224a31.936 31.936 0 1 0 45.12 45.184L512 557.184l252.288 252.288a31.936 31.936 0 0 0 45.12-45.12L557.12 512.064l252.288-252.352a31.936 31.936 0 1 0-45.12-45.184z"></path>',
        },
        house: {
            viewBox: '0 0 64 64',
            content:
                '<path fill="currentColor" d="M62.79,29.172l-28-28C34.009,0.391,32.985,0,31.962,0s-2.047.391-2.828,1.172l-28,28c-1.562,1.566-1.484,4.016.078,5.578c1.566,1.57,3.855,1.801,5.422.234L8,33.617V60c0,2.211,1.789,4,4,4h16V48h8v16h16c2.211,0,4-1.789,4-4V33.695l1.195,1.195c1.562,1.562,3.949,1.422,5.516-.141C64.274,33.188,64.356,30.734,62.79,29.172z"></path>',
        },
        keyboard: {
            viewBox: '0 0 24 24',
            content:
                '<path fill="none" d="M17.5 5.00006H6.5C5.37366 4.93715 4.2682 5.32249 3.42505 6.07196C2.5819 6.82143 2.06958 7.87411 2 9.00006V15.0001C2.06958 16.126 2.5819 17.1787 3.42505 17.9282C4.2682 18.6776 5.37366 19.0628 6.5 18.9999H17.5C18.6263 19.0628 19.7319 18.6776 20.575 17.9282C21.4182 17.1787 21.9304 16.126 22 15.0001V9.00006C21.9304 7.87411 21.4182 6.82143 20.575 6.07196C19.7319 5.32249 18.6263 4.93715 17.5 5.00006V5.00006Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path fill="none" d="M6 15H18M6 12H8M6 9H8M11 12H13M11 9H13M16 12H18M16 9H18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>',
        },
        palette: {
            viewBox: '0 0 512 512',
            content:
                '<path fill="currentColor" d="M410.842,207.265c97.767-8.626,117.891-54.628,89.098-97.749C448.234,32.075,334.016,1.59,218.762,36.607 C73.721,80.672-22.226,214.687,4.453,335.938C31.13,457.19,170.334,519.762,315.375,475.697 c62.951-19.13,116.653-55.201,155.091-99.821c15.516-18.01,20.891-73.726-50.998-70.844 C342.812,308.106,332.197,214.206,410.842,207.265z M385.949,102.144c7.068-7.059,16.84-11.111,26.839-11.111 c9.998,0,19.762,4.052,26.838,11.111c7.067,7.076,11.119,16.848,11.119,26.847s-4.052,19.762-11.119,26.838 c-7.076,7.067-16.84,11.12-26.838,11.12c-9.999,0-19.771-4.052-26.839-11.12c-7.067-7.076-11.119-16.839-11.119-26.838 S378.882,109.22,385.949,102.144z M65.256,226.724c5.711-17.185,24.26-26.485,41.436-20.782 c17.185,5.711,26.493,24.261,20.79,41.437c-5.711,17.184-24.269,26.484-41.438,20.789C68.861,262.449,59.553,243.9,65.256,226.724z M127.946,377.433c-11.794,12.451-31.455,12.998-43.905,1.214c-12.459-11.793-12.998-31.446-1.204-43.896 c11.785-12.459,31.437-13.006,43.896-1.213C139.182,345.323,139.73,364.975,127.946,377.433z M190.542,171.051 c-15.466,11.128-37.031,7.606-48.159-7.86c-11.128-15.474-7.606-37.03,7.859-48.159v-0.008 c15.475-11.119,37.032-7.598,48.159,7.868C209.53,138.358,206.009,159.923,190.542,171.051z M250.461,105.589 c-2.317-19.88,11.919-37.857,31.8-40.165c19.872-2.308,37.857,11.929,40.165,31.8c2.316,19.872-11.928,37.856-31.801,40.164 C270.746,139.706,252.769,125.461,250.461,105.589z M360.897,377.106c0,12.121-4.911,23.948-13.478,32.524 c-8.567,8.566-20.411,13.478-32.533,13.478c-12.113,0-23.965-4.912-32.524-13.478c-8.566-8.576-13.478-20.403-13.478-32.524 c0-12.122,4.912-23.974,13.478-32.542c8.559-8.559,20.411-13.47,32.524-13.47c12.122,0,23.966,4.911,32.533,13.47 C355.986,353.131,360.897,364.983,360.897,377.106z"></path>',
        },
        users: {
            viewBox: '0 0 24 24',
            content:
                '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M5 9.5C5 7.01472 7.01472 5 9.5 5C11.9853 5 14 7.01472 14 9.5C14 11.9853 11.9853 14 9.5 14C7.01472 14 5 11.9853 5 9.5Z"></path><path fill="currentColor" d="M14.3675 12.0632C14.322 12.1494 14.3413 12.2569 14.4196 12.3149C15.0012 12.7454 15.7209 13 16.5 13C18.433 13 20 11.433 20 9.5C20 7.567 18.433 6 16.5 6C15.7209 6 15.0012 6.2546 14.4196 6.68513C14.3413 6.74313 14.322 6.85058 14.3675 6.93679C14.7714 7.70219 15 8.5744 15 9.5C15 10.4256 14.7714 11.2978 14.3675 12.0632Z"></path><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M4.64115 15.6993C5.87351 15.1644 7.49045 15 9.49995 15C11.5112 15 13.1293 15.1647 14.3621 15.7008C15.705 16.2847 16.5212 17.2793 16.949 18.6836C17.1495 19.3418 16.6551 20 15.9738 20H3.02801C2.34589 20 1.85045 19.3408 2.05157 18.6814C2.47994 17.2769 3.29738 16.2826 4.64115 15.6993Z"></path><path fill="currentColor" d="M14.8185 14.0364C14.4045 14.0621 14.3802 14.6183 14.7606 14.7837V14.7837C15.803 15.237 16.5879 15.9043 17.1508 16.756C17.6127 17.4549 18.33 18 19.1677 18H20.9483C21.6555 18 22.1715 17.2973 21.9227 16.6108C21.9084 16.5713 21.8935 16.5321 21.8781 16.4932C21.5357 15.6286 20.9488 14.9921 20.0798 14.5864C19.2639 14.2055 18.2425 14.0483 17.0392 14.0008L17.0194 14H16.9997C16.2909 14 15.5506 13.9909 14.8185 14.0364Z"></path>',
        },
        more: {
            viewBox: '0 0 32 32',
            content:
                '<path fill="currentColor" d="M10.429 16a2.715 2.715 0 1 1-5.43 0 2.715 2.715 0 0 1 5.43 0zM16 13.286a2.715 2.715 0 1 0 .001 5.429A2.715 2.715 0 0 0 16 13.286zm8.285 0a2.714 2.714 0 1 0 0 5.428 2.714 2.714 0 0 0 0-5.428z"></path>',
        },
        search: {
            viewBox: '0 0 24 24',
            content:
                '<path fill="none" d="M11 6C13.7614 6 16 8.23858 16 11M16.6588 16.6549L21 21M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>',
        },
        reset: {
            viewBox: '0 0 1920 1920',
            content:
                '<path fill="currentColor" fill-rule="evenodd" d="M960 0v213.333c411.627 0 746.667 334.934 746.667 746.667S1371.627 1706.667 960 1706.667 213.333 1371.733 213.333 960c0-197.013 78.4-382.507 213.334-520.747v254.08H640V106.667H53.333V320h191.04C88.64 494.08 0 720.96 0 960c0 529.28 430.613 960 960 960s960-430.72 960-960S1489.387 0 960 0"></path>',
        },
        export: {
            viewBox: '0 0 24 24',
            content:
                '<path d="M17 17H17.01M15.6 14H18C18.9319 14 19.3978 14 19.7654 14.1522C20.2554 14.3552 20.6448 14.7446 20.8478 15.2346C21 15.6022 21 16.0681 21 17C21 17.9319 21 18.3978 20.8478 18.7654C20.6448 19.2554 20.6448 19.2554 20.8478 19.8478C19.3978 20 18.9319 20 18 20H6C5.06812 20 4.60218 20 4.23463 19.8478C3.74458 19.6448 3.35523 19.2554 3.15224 18.7654C3 18.3978 3 17.9319 3 17C3 16.0681 3 15.6022 3.15224 15.2346C3.35523 14.7446 3.74458 14.3552 4.23463 14.1522C4.60218 14 5.06812 14 6 14H8.4M12 15V4M12 4L15 7M12 4L9 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>',
        },
        upload: {
            viewBox: '0 0 24 24',
            content:
                '<path d="M17 17H17.01M15.6 14H18C18.9319 14 19.3978 14 19.7654 14.1522C20.2554 14.3552 20.6448 14.7446 20.8478 15.2346C21 15.6022 21 16.0681 21 17C21 17.9319 21 18.3978 20.8478 18.7654C20.6448 19.2554 20.6448 19.2554 20.8478 19.8478C19.3978 20 18.9319 20 18 20H6C5.06812 20 4.60218 20 4.23463 19.8478C3.74458 19.6448 3.35523 19.2554 3.15224 18.7654C3 18.3978 3 17.9319 3 17C3 16.0681 3 15.6022 3.15224 15.2346C3.35523 14.7446 3.74458 14.3552 4.23463 14.1522C4.60218 14 5.06812 14 6 14H8.4M12 15V4M12 4L15 7M12 4L9 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>',
        },
        download: {
            viewBox: '0 0 24 24',
            content:
                '<path d="M17 17H17.01M17.4 14H18C18.9319 14 19.3978 14 19.7654 14.1522C20.2554 14.3552 20.6448 14.7446 20.8478 15.2346C21 15.6022 21 16.0681 21 17C21 17.9319 21 18.3978 20.8478 18.7654C20.6448 19.2554 20.6448 19.2554 20.8478 19.8478C19.3978 20 18.9319 20 18 20H6C5.06812 20 4.60218 20 4.23463 19.8478C3.74458 19.6448 3.35523 19.2554 3.15224 18.7654C3 18.3978 3 17.9319 3 17C3 16.0681 3 15.6022 3.15224 15.2346C3.35523 14.7446 3.74458 14.3552 4.23463 14.1522C4.60218 14 5.06812 14 6 14H6.6M12 15V4M12 15L9 12M12 15L15 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>',
        },
        plus: {
            viewBox: '0 0 24 24',
            content:
                '<path d="M6 12H18M12 6V18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>',
        },
        userPlus: {
            viewBox: '0 0 24 24',
            content:
                '<path fill="currentColor" d="M9.94286 3C7.52858 3 5.57143 4.95716 5.57143 7.37143C5.57143 9.7857 7.52858 11.7429 9.94286 11.7429C12.3571 11.7429 14.3143 9.7857 14.3143 7.37143C14.3143 4.95716 12.3571 3 9.94286 3Z"></path><path fill="currentColor" d="M12.5226 13.6877C10.8136 13.4149 9.07213 13.4149 7.36313 13.6877L7.17994 13.7169C4.77189 14.1012 3 16.1783 3 18.6168C3 19.933 4.06698 21 5.38317 21H14.5025C15.8187 21 16.8857 19.933 16.8857 18.6168C16.8857 16.1783 15.1138 14.1012 12.7058 13.7169L12.5226 13.6877Z"></path><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M18.1714 9.17143C18.5975 9.17143 18.9429 9.51681 18.9429 9.94286V11.2286H20.2286C20.6546 11.2286 21 11.574 21 12C21 12.426 20.6546 12.7714 20.2286 12.7714H18.9429V14.0571C18.9429 14.4832 18.5975 14.8286 18.1714 14.8286C17.7454 14.8286 17.4 14.4832 17.4 14.0571V12.7714H16.1143C15.6882 12.7714 15.3429 12.426 15.3429 12C15.3429 11.574 15.6882 11.2286 16.1143 11.2286H17.4V9.94286C17.4 9.51681 17.7454 9.17143 18.1714 9.17143Z"></path>',
        },
        signIn: {
            viewBox: '0 0 512 512',
            content:
                '<path fill="currentColor" d="M416 448h-84c-6.6 0-12-5.4-12-12v-40c0-6.6 5.4-12 12-12h84c17.7 0 32-14.3 32-32V160c0-17.7-14.3-32-32-32h-84c-6.6 0-12-5.4-12-12V76c0-6.6 5.4-12 12-12h84c53 0 96 43 96 96v192c0 53-43 96-96 96zm-47-201L201 79c-15-15-41-4.5-41 17v96H24c-13.3 0-24 10.7-24 24v96c0 13.3 10.7 24 24 24h136v96c0 21.5 26 32 41 17l168-168c9.3-9.4 9.3-24.6 0-34z"></path>',
        },
        gear: {
            viewBox: '0 0 24 24',
            content:
                '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M12.7848 0.449982C13.8239 0.449982 14.7167 1.16546 14.9122 2.15495L14.9991 2.59495C15.3408 4.32442 17.1859 5.35722 18.9016 4.7794L19.3383 4.63233C20.3199 4.30175 21.4054 4.69358 21.9249 5.56605L22.7097 6.88386C23.2293 7.75636 23.0365 8.86366 22.2504 9.52253L21.9008 9.81555C20.5267 10.9672 20.5267 13.0328 21.9008 14.1844L22.2504 14.4774C23.0365 15.1363 23.2293 16.2436 22.7097 17.1161L21.925 18.4339C21.4054 19.3064 20.3199 19.6982 19.3382 19.3676L18.9017 19.2205C17.1859 18.6426 15.3408 19.6754 14.9991 21.405L14.9122 21.845C14.7167 22.8345 13.8239 23.55 12.7848 23.55H11.2152C10.1761 23.55 9.28331 22.8345 9.08781 21.8451L9.00082 21.4048C8.65909 19.6754 6.81395 18.6426 5.09822 19.2205L4.66179 19.3675C3.68016 19.6982 2.59465 19.3063 2.07505 18.4338L1.2903 17.1161C0.770719 16.2436 0.963446 15.1363 1.74956 14.4774L2.09922 14.1844C3.47324 13.0327 3.47324 10.9672 2.09922 9.8156L1.74956 9.52254C0.963446 8.86366 0.77072 7.75638 1.2903 6.8839L2.07508 5.56608C2.59466 4.69359 3.68014 4.30176 4.66176 4.63236L5.09831 4.77939C6.81401 5.35722 8.65909 4.32449 9.00082 2.59506L9.0878 2.15487C9.28331 1.16542 10.176 0.449982 11.2152 0.449982H12.7848ZM12 15.3C13.8225 15.3 15.3 13.8225 15.3 12C15.3 10.1774 13.8225 8.69998 12 8.69998C10.1774 8.69998 8.69997 10.1774 8.69997 12C8.69997 13.8225 10.1774 15.3 12 15.3Z"></path>',
        },
        smiley: {
            viewBox: '0 0 108.364 108.364',
            content:
                '<path fill="currentColor" d="M54.182,0C24.258,0,0,24.258,0,54.182c0,29.924,24.258,54.183,54.182,54.183c29.923,0,54.182-24.259,54.182-54.183 C108.364,24.258,84.105,0,54.182,0z M62.372,44.193l7.694-9.755c0.158-0.197,0.393-0.308,0.646-0.308s0.486,0.111,0.642,0.304 l7.697,9.757c0.188,0.237,0.229,0.58,0.1,0.859c-0.146,0.293-0.428,0.467-0.741,0.467h-3.554c-0.182,0-0.352-0.083-0.463-0.225 l-3.681-4.664l-3.681,4.664c-0.112,0.141-0.281,0.225-0.462,0.225h-3.552c-0.313,0-0.604-0.18-0.738-0.459 c-0.055-0.113-0.082-0.237-0.082-0.359C62.198,44.516,62.26,44.336,62.372,44.193z M30.253,44.193l7.695-9.755 c0.158-0.197,0.392-0.308,0.645-0.308s0.486,0.111,0.641,0.304l7.697,9.757c0.189,0.237,0.229,0.58,0.1,0.859 c-0.146,0.293-0.428,0.467-0.741,0.467h-3.554c-0.181,0-0.351-0.083-0.463-0.225l-3.68-4.664l-3.681,4.664 c-0.112,0.141-0.281,0.225-0.462,0.225h-3.552c-0.313,0-0.604-0.18-0.738-0.459c-0.055-0.113-0.082-0.237-0.082-0.359 C30.078,44.516,30.14,44.336,30.253,44.193z M80.318,63.574C76.033,73.479,66,79.878,54.755,79.878 c-11.486,0-21.58-6.431-25.714-16.382c-0.185-0.443-0.135-0.949,0.131-1.348c0.267-0.397,0.714-0.637,1.192-0.637 c0.001,0,0.001,0,0.002,0l48.638,0.061c0.482,0,0.932,0.244,1.196,0.646C80.465,62.622,80.51,63.131,80.318,63.574z"></path>',
        },
        send: {
            viewBox: '0 0 24 24',
            content:
                '<path fill="currentColor" d="M16.1391 2.95907L7.10914 5.95907C1.03914 7.98907 1.03914 11.2991 7.10914 13.3191L9.78914 14.2091L10.6791 16.8891C12.6991 22.9591 16.0191 22.9591 18.0391 16.8891L21.0491 7.86907C22.3891 3.81907 20.1891 1.60907 16.1391 2.95907ZM16.4591 8.33907L12.6591 12.1591C12.5091 12.3091 12.3191 12.3791 12.1291 12.3791C11.9391 12.3791 11.7491 12.3091 11.5991 12.1591C11.3091 11.8691 11.3091 11.3891 11.5991 11.0991L15.3991 7.27907C15.6891 6.98907 16.1691 6.98907 16.4591 7.27907C16.7491 7.56907 16.7491 8.04907 16.4591 8.33907Z"></path>',
        },
        caretDown: {
            viewBox: '0 0 16 16',
            content:
                '<path fill="currentColor" d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"></path>',
        },
        user: {
            viewBox: '0 0 24 24',
            content:
                '<circle cx="12" cy="6" r="4" fill="currentColor"></circle><ellipse cx="12" cy="17" rx="7" ry="4" fill="currentColor"></ellipse>',
        },
        mapPin: {
            viewBox: '0 0 24 24',
            content:
                '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M11.3856 23.789L11.3831 23.7871L11.3769 23.7822L11.355 23.765C11.3362 23.7501 11.3091 23.7287 11.2742 23.7008C11.2046 23.6451 11.1039 23.5637 10.9767 23.4587C10.7224 23.2488 10.3615 22.944 9.92939 22.5599C9.06662 21.793 7.91329 20.7041 6.75671 19.419C5.60303 18.1371 4.42693 16.639 3.53467 15.0528C2.64762 13.4758 2 11.7393 2 10C2 7.34784 3.05357 4.8043 4.92893 2.92893C6.8043 1.05357 9.34784 0 12 0C14.6522 0 17.1957 1.05357 19.0711 2.92893C20.9464 4.8043 22 7.34784 22 10C22 11.7393 21.3524 13.4758 20.4653 15.0528C19.5731 16.639 18.397 18.1371 17.2433 19.419C16.0867 20.7041 14.9334 21.793 14.0706 22.5599C13.6385 22.944 13.2776 23.2488 13.0233 23.4587C12.8961 23.5637 12.7954 23.6451 12.7258 23.7008C12.6909 23.7287 12.6638 23.7501 12.645 23.765L12.6231 23.7822L12.6169 23.7871L12.615 23.7885C12.615 23.7885 12.6139 23.7894 12 23L12.6139 23.7894C12.2528 24.0702 11.7467 24.0699 11.3856 23.789ZM12 23L11.3856 23.789C11.3856 23.789 11.3861 23.7894 12 23ZM15 10C15 11.6569 13.6569 13 12 13C10.3431 13 9 11.6569 9 10C9 8.34315 10.3431 7 12 7C13.6569 7 15 8.34315 15 10Z"></path>',
        },
        userCircle: {
            viewBox: '0 0 24 24',
            content:
                '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM11.9999 6C9.79077 6 7.99991 7.79086 7.99991 10C7.99991 12.2091 9.79077 14 11.9999 14C14.209 14 15.9999 12.2091 15.9999 10C15.9999 7.79086 14.209 6 11.9999 6ZM17.1115 15.9974C17.8693 16.4854 17.8323 17.5491 17.1422 18.1288C15.7517 19.2966 13.9581 20 12.0001 20C10.0551 20 8.27215 19.3059 6.88556 18.1518C6.18931 17.5723 6.15242 16.5032 6.91351 16.012C7.15044 15.8591 7.40846 15.7251 7.68849 15.6097C8.81516 15.1452 10.2542 15 12 15C13.7546 15 15.2018 15.1359 16.3314 15.5954C16.6136 15.7102 16.8734 15.8441 17.1115 15.9974Z"></path>',
        },
        camera: {
            viewBox: '0 -2 32 32',
            content:
                '<path fill="currentColor" d="M286,471 L283,471 L282,469 C281.411,467.837 281.104,467 280,467 L268,467 C266.896,467 266.53,467.954 266,469 L265,471 L262,471 C259.791,471 258,472.791 258,475 L258,491 C258,493.209 259.791,495 262,495 L286,495 C288.209,495 290,493.209 290,491 L290,475 C290,472.791 288.209,471 286,471 Z M274,491 C269.582,491 266,487.418 266,483 C266,478.582 269.582,475 274,475 C278.418,475 282,478.582 282,483 C282,487.418 278.418,491 274,491 Z M274,477 C270.687,477 268,479.687 268,483 C268,486.313 270.687,489 274,489 C277.313,489 280,486.313 280,483 C280,479.687 277.313,477 274,477 L274,477 Z"></path>',
        },
        trash: {
            viewBox: '0 0 24 24',
            content:
                '<path fill="currentColor" d="M3 6.38597C3 5.90152 3.34538 5.50879 3.77143 5.50879L6.43567 5.50832C6.96502 5.49306 7.43202 5.11033 7.61214 4.54412C7.61688 4.52923 7.62232 4.51087 7.64185 4.44424L7.75665 4.05256C7.8269 3.81241 7.8881 3.60318 7.97375 3.41617C8.31209 2.67736 8.93808 2.16432 9.66147 2.03297C9.84457 1.99972 10.0385 1.99986 10.2611 2.00002H13.7391C13.9617 1.99986 14.1556 1.99972 14.3387 2.03297C15.0621 2.16432 15.6881 2.67736 16.0264 3.41617C16.1121 3.60318 16.1733 3.81241 16.2435 4.05256L16.3583 4.44424C16.3778 4.51087 16.3833 4.52923 16.388 4.54412C16.5682 5.11033 17.1278 5.49353 17.6571 5.50879H20.2286C20.6546 5.50879 21 5.90152 21 6.38597C21 6.87043 20.6546 7.26316 20.2286 7.26316H3.77143C3.34538 7.26316 3 6.87043 3 6.38597Z"></path><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M11.5956 22.0001H12.4044C15.1871 22.0001 16.5785 22.0001 17.4831 21.1142C18.3878 20.2283 18.4803 18.7751 18.6654 15.8686L18.9321 11.6807C19.0326 10.1037 19.0828 9.31524 18.6289 8.81558C18.1751 8.31592 17.4087 8.31592 15.876 8.31592H8.12404C6.59127 8.31592 5.82488 8.31592 5.37105 8.81558C4.91722 9.31524 4.96744 10.1037 5.06788 11.6807L5.33459 15.8686C5.5197 18.7751 5.61225 20.2283 6.51689 21.1142C7.42153 22.0001 8.81289 22.0001 11.5956 22.0001ZM10.2463 12.1886C10.2051 11.7548 9.83753 11.4382 9.42537 11.4816C9.01321 11.525 8.71251 11.9119 8.75372 12.3457L9.25372 17.6089C9.29494 18.0427 9.66247 18.3593 10.0746 18.3159C10.4868 18.2725 10.7875 17.8856 10.7463 17.4518L10.2463 12.1886ZM14.5746 11.4816C14.9868 11.525 15.2875 11.9119 15.2463 12.3457L14.7463 17.6089C14.7051 18.0427 14.3375 18.3593 13.9254 18.3159C13.5132 18.2725 13.2125 17.8856 13.2537 17.4518L13.7537 12.1886C13.7949 11.7548 14.1625 11.4382 14.5746 11.4816Z"></path>',
        },
        userMinus: {
            viewBox: '0 0 256 256',
            content:
                '<path fill="currentColor" d="M198.13,194.85A8,8,0,0,1,192,208H24a8,8,0,0,1-6.12-13.15c14.94-17.78,33.52-30.41,54.17-37.17a68,68,0,1,1,71.9,0C164.6,164.44,183.18,177.07,198.13,194.85ZM248,128H200a8,8,0,0,0,0,16h48a8,8,0,0,0,0-16Z"></path>',
        },
        chat: {
            viewBox: '0 0 24 24',
            content:
                '<path opacity="0.5" fill="currentColor" d="M13.6288 20.4718L13.0867 21.3877C12.6035 22.204 11.3965 22.204 10.9133 21.3877L10.3712 20.4718C9.95073 19.7614 9.74049 19.4063 9.40279 19.2098C9.06509 19.0134 8.63992 19.0061 7.78958 18.9915C6.53422 18.9698 5.74689 18.8929 5.08658 18.6194C3.86144 18.1119 2.88807 17.1386 2.3806 15.9134C2 14.9946 2 13.8297 2 11.5V10.5C2 7.22657 2 5.58985 2.7368 4.38751C3.14908 3.71473 3.71473 3.14908 4.38751 2.7368C5.58985 2 7.22657 2 10.5 2H13.5C16.7734 2 18.4101 2 19.6125 2.7368C20.2853 3.14908 20.8509 3.71473 21.2632 4.38751C22 5.58985 22 7.22657 22 10.5V11.5C22 13.8297 22 14.9946 21.6194 15.9134C21.1119 17.1386 20.1386 18.1119 18.9134 18.6194C18.2531 18.8929 17.4658 18.9698 16.2104 18.9915C15.36 19.0061 14.9349 19.0134 14.5972 19.2098C14.2595 19.4062 14.0492 19.7614 13.6288 20.4718Z"></path><path fill="currentColor" d="M7.25 9C7.25 8.58579 7.58579 8.25 8 8.25H16C16.4142 8.25 16.75 8.58579 16.75 9C16.75 9.41421 16.4142 9.75 16 9.75H8C7.58579 9.75 7.25 9.41421 7.25 9Z"></path><path fill="currentColor" d="M7.25 12.5C7.25 12.0858 7.58579 11.75 8 11.75H13.5C13.9142 11.75 14.25 12.0858 14.25 12.5C14.25 12.9142 13.9142 13.25 13.5 13.25H8C7.58579 13.25 7.25 12.9142 7.25 12.5Z"></path>',
        },
        check: {
            viewBox: '0 0 24 24',
            content:
                '<path d="M4 12.6111L8.92308 17.5L20 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>',
        },
        star: {
            viewBox: '0 0 64 64',
            content:
                '<path fill="currentColor" d="M62.799,23.737c-0.47-1.399-1.681-2.419-3.139-2.642l-16.969-2.593L35.069,2.265 C34.419,0.881,33.03,0,31.504,0c-1.527,0-2.915,0.881-3.565,2.265l-7.623,16.238L3.347,21.096c-1.458,0.223-2.669,1.242-3.138,2.642 c-0.469,1.4-0.115,2.942,0.916,4l12.392,12.707l-2.935,17.977c-0.242,1.488,0.389,2.984,1.62,3.854 c1.23,0.87,2.854,0.958,4.177,0.228l15.126-8.365l15.126,8.365c0.597,0.33,1.254,0.492,1.908,0.492c0.796,0,1.592-0.242,2.269-0.72 c1.231-0.869,1.861-2.365,1.619-3.854l-2.935-17.977l12.393-12.707C62.914,26.68,63.268,25.138,62.799,23.737z"></path>',
        },
        pushPin: {
            viewBox: '0 0 512 512',
            content:
                '<path fill="currentColor" d="M98.715,369.376l-97.028,97.02L0,512l45.603-1.688l97.02-97.02c-7.614-6.725-15.196-13.783-22.665-21.252 C112.49,384.572,105.425,376.991,98.715,369.376z"></path><path fill="currentColor" d="M446.021,65.979C387.878,7.853,317.914-16.443,289.735,11.744c-15.688,15.672-15.074,44.312-1.477,76.625 l-88.3,76.56c-55.728-31.15-107.774-37.642-133.911-11.506c-39.168,39.168-5.426,136.398,75.349,217.18 c80.782,80.775,178.013,114.517,217.173,75.357c26.144-26.144,19.653-78.19-11.498-133.911l76.576-88.3 c32.305,13.589,60.936,14.194,76.608-1.478C528.442,194.085,504.155,124.121,446.021,65.979z"></path>',
        },
    };

    ICONS.camera.content = ICONS.camera.content.replace('<path fill=', '<path transform="translate(-258 -467)" fill=');
    ICONS.camera.content = ICONS.camera.content.replace('C266.896,467.954 266.53,467.954', 'C266.896,467 266.53,467.954');
    for (const name of ['export', 'upload', 'download']) {
        ICONS[name].content = ICONS[name].content
            .replace(/<path(?![^>]*\bfill=)/g, '<path fill="none"')
            .replace('C20.6448 19.2554 20.6448 19.2554 20.8478 19.8478', 'C20.6448 19.2554 20.2554 19.6448 19.7654 19.8478');
    }
    ICONS.export.content = ICONS.download.content;

    /**
     * @param {string} name
     * @param {number} [size=20]
     * @returns {string}
     */
    function icon(name, size = 20) {
        const definition = ICONS[name];
        if (!definition) return '';
        const svgSize = Number.isFinite(Number(size)) ? Math.max(1, Math.round(Number(size))) : 20;
        return `<svg class="sigmod-icon" width="${svgSize}" height="${svgSize}" viewBox="${definition.viewBox}" fill="currentColor" aria-hidden="true" focusable="false">${definition.content}</svg>`;
    }
    const SELECTORS = {
        page: '.body__inner',
        menu: '#menu',
        menuWrapper: '#menu-wrapper',
        menuContent: '.menu-center-content',
        settingsGrid: '.checkbox-grid',
        canvas: '#canvas',
        nickname: '#nick',
        gameMode: '#gamemode',
        play: '#play-btn',
        spectate: '#spectate-btn',
        chat: '#chat_textbox',
        chatBlock: '#chat_block',
        deathScreen: '#__line2',
        continueButton: '#continue_button',
        overlays: '#overlays',
    };
    const TIMING = {
        hostReadyTimeout: 15_000,
        backendReconnectBase: 1_500,
        backendReconnectMax: 30_000,
        backendPing: 2_000,
        serverStatsPing: 5_000,
        positionPublish: 300,
        scorePublish: 500,
        mouseFeed: 50,
        autoRespawn: 200,
        uiTransition: 300,
    };
    const OPCODE = {
        play: 0x00,
        move: 0x10,
        split: 0x11,
        qDown: 0x12,
        qUp: 0x13,
        eject: 0x15,
        ownedCell: 0x20,
        leaderboardText: 0x30,
        leaderboardFfa: 0x31,
        border: 0x40,
        chat: 0x63,
        passwordRequired: 0xb4,
        session: 0xdd,
        stats: 0xfe,
    };
    const MOUSE_ACTIONS = [
        { value: null, label: 'None' },
        { value: 'fastfeed', label: 'Fast Feed' },
        { value: 'split', label: 'Split' },
        { value: 'split2', label: 'Double Split' },
        { value: 'split3', label: 'Triple Split' },
        { value: 'split4', label: 'Quad Split' },
        { value: 'freeze', label: 'Horizontal Line' },
        { value: 'dTrick', label: 'Double Trick' },
        { value: 'sTrick', label: 'Self Trick' },
        { value: 'ping', label: 'Ping' },
    ];
    const STANDARD_MOUSE_BUTTONS = [
        { button: 0, name: 'Left', code: 'Button 0' },
        { button: 1, name: 'Middle', code: 'Button 1' },
        { button: 2, name: 'Right', code: 'Button 2' },
        { button: 3, name: 'Back', code: 'Button 3' },
        { button: 4, name: 'Forward', code: 'Button 4' },
    ];
    /**
     * @typedef {'fastfeed'|'split'|'split2'|'split3'|'split4'|'freeze'|'dTrick'|'sTrick'|'ping'} MouseMacro
     *
     * @typedef {Object} SigModSettings
     * @property {number} storageVersion
     * @property {MacroSettings} macros
     * @property {GameVisualSettings} game
     * @property {ThemeSettings} themes
     * @property {GeneralSettings} settings
     * @property {ChatSettings} chat
     * @property {{authorized: boolean}} modAccount
     *
     * @typedef {Object} MacroSettings
     * @property {number} feedSpeed
     * @property {Object} keys
     * @property {{bindings: Array<{button: number, action: MouseMacro}>}} mouse
     *
     * @typedef {Object} GameVisualSettings
     * @property {string} font
     * @property {string|null} borderColor
     * @property {string|null} foodColor
     * @property {string|null} cellColor
     * @property {string} virusImage
     * @property {boolean} shortenNames
     * @property {boolean} showFood
     * @property {boolean} showLeaderboard
     * @property {boolean} hideOwnName
     * @property {boolean} botSkinsOnly
     * @property {boolean} showOwnSkinWithBots
     * @property {boolean} removeOutlines
     * @property {{original: string|null, replacement: string|null}} skins
     * @property {{color: string|null, image: string}} map
     * @property {{color: string|null, gradient: {enabled: boolean, left: string|null, right: string|null}}} name
     *
     * @typedef {Object} ThemeSettings
     * @property {string} current
     * @property {Array<Record<string, unknown>>} custom
     * @property {string|null} inputBorderRadius
     * @property {string|null} menuBorderRadius
     * @property {string} inputBorder
     * @property {boolean} hideDiscordBtns
     * @property {boolean} hideLangs
     * @property {boolean} hideAds
     * @property {boolean} showZigPopup
     *
     * @typedef {Object} GeneralSettings
     * @property {string|null} tag
     * @property {{x: number, y: number}} partyPanel
     * @property {number} pingDuration
     * @property {string[]} savedNames
     * @property {boolean} autoRespawn
     * @property {boolean} playTimer
     * @property {boolean} mouseTracker
     * @property {boolean} autoClaimCoins
     * @property {boolean} showChallenges
     * @property {'center'|'left'|'right'|'top'|'bottom'} deathScreenPos
     * @property {boolean} removeShopPopup
     * @property {string[]} quickAccess
     *
     * @typedef {Object} ChatSettings
     * @property {string} bgColor
     * @property {string} textColor
     * @property {boolean} compact
     * @property {string} themeColor
     * @property {boolean} showTime
     * @property {boolean} showNameColors
     * @property {boolean} showClientChat
     * @property {boolean} showChatButtons
     * @property {boolean} blurTag
     * @property {string} locationText
     *
     * @typedef {{x: number, y: number}} Point
     * @typedef {{left: number, top: number, right: number, bottom: number, width: number, height: number}} WorldBorder
     * @typedef {'native'|'sigfix'} HostKind
     * @typedef {'split'|'eject'|'qDown'|'qUp'} HostAction
     *
     * @typedef {Object} HostSnapshot
     * @property {boolean} connected
     * @property {boolean} playing
     * @property {unknown} selectedView
     * @property {Point|null} position
     * @property {number} score
     * @property {number} ownedCount
     * @property {WorldBorder|null} border
     * @property {number|null} latency
     * @property {number|null} playerCount
     */
    /** @type {SigModSettings} */
    const DEFAULT_SETTINGS = {
        storageVersion: BUILD.settingsVersion,
        macros: {
            feedSpeed: 40,
            keys: {
                rapidFeed: 'w',
                respawn: 'b',
                ping: 'r',
                location: 'y',
                saveImage: null,
                splits: {
                    double: 'd',
                    triple: 'f',
                    quad: 'g',
                    doubleTrick: null,
                    selfTrick: null,
                },
                line: {
                    horizontal: 's',
                    vertical: 't',
                    fixed: null,
                    instantSplit: 0,
                },
                toggle: {
                    menu: 'v',
                    chat: 'z',
                    names: null,
                    skins: null,
                    autoRespawn: null,
                },
            },
            mouse: { bindings: [] },
        },
        game: {
            font: 'Ubuntu',
            borderColor: null,
            foodColor: null,
            cellColor: null,
            virusImage: '/assets/images/viruses/2.png',
            shortenNames: false,
            showFood: true,
            showLeaderboard: true,
            hideOwnName: false,
            botSkinsOnly: false,
            showOwnSkinWithBots: true,
            removeOutlines: false,
            skins: { original: null, replacement: null },
            map: { color: null, image: '' },
            name: {
                color: null,
                gradient: { enabled: false, left: null, right: null },
            },
        },
        themes: {
            current: 'Dark',
            custom: [],
            inputBorderRadius: null,
            menuBorderRadius: null,
            inputBorder: '1px',
            hideDiscordBtns: false,
            hideLangs: false,
            hideAds: true,
            showZigPopup: false,
        },
        settings: {
            tag: null,
            partyPanel: { x: 4, y: 300 },
            pingDuration: 2_000,
            savedNames: [],
            autoRespawn: false,
            playTimer: false,
            mouseTracker: false,
            autoClaimCoins: false,
            showChallenges: false,
            deathScreenPos: 'center',
            removeShopPopup: true,
            quickAccess: [
                'host:showNames',
                'host:showSkins',
                'host:showMass',
                'host:showFood',
                'setting:chat.enabled',
                'host:showMinimap',
                'host:showBorder',
                'host:showGrid',
                'host:moreZoom',
                'host:jellyPhysics',
                'host:showClanmates',
                'setting:settings.playTimer',
                'setting:settings.mouseTracker',
                'host:autoRespawn',
                'host:showLeaderboard',
                'host:autoClaimCoins',
            ],
        },
        chat: {
            enabled: true,
            bgColor: '#00000040',
            textColor: '#ffffff',
            compact: false,
            themeColor: '#8a25e5',
            showTime: true,
            showNameColors: true,
            showClientChat: false,
            showChatButtons: true,
            blurTag: false,
            locationText: '{pos}',
        },
        modAccount: { authorized: false },
    };
    const BOT_SKIN_NAMES = new Set([
        'Valeriy',
        'Mtch',
        'Messi',
        'Michael',
        'LadyInRed',
        'Slava',
        'Migel',
        'Mik',
        'Moon',
        'Ignasio',
        'Cos',
        'Bred',
        'Krishtianu',
        'Varpat',
        'Monica',
        'Loli',
        'Corat',
        'Sun',
        'ChaCha',
        'Voron',
        'Baby',
        'Mimi',
    ]);
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const KEYBIND_CODE_PREFIX = 'code:';
    /** @param {KeyboardEvent} event */
    const keybindValueFromEvent = (event) => {
        const key = typeof event.key === 'string' ? event.key : '';
        if (key && !['Dead', 'Unidentified', 'Process'].includes(key)) return key.toLowerCase();
        const code = typeof event.code === 'string' ? event.code : '';
        return code ? `${KEYBIND_CODE_PREFIX}${code.toLowerCase()}` : null;
    };
    /** @param {string} binding */
    const keybindCodeLabel = (binding) => {
        const code = binding.slice(KEYBIND_CODE_PREFIX.length);
        const label = code ? `${code[0].toUpperCase()}${code.slice(1)}` : '';
        return label ? `Physical ${label.replace(/([a-z])([A-Z])/g, '$1 $2')}` : binding;
    };
    /** @param {KeyboardEvent} event @param {unknown} binding */
    const keybindMatchesEvent = (event, binding) => {
        if (typeof binding !== 'string' || !binding.length) return false;
        const normalized = binding.toLowerCase();
        return normalized.startsWith(KEYBIND_CODE_PREFIX)
            ? keybindValueFromEvent(event) === normalized
            : String(event.key).toLowerCase() === normalized;
    };
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const readLocalJson = (key, fallback) => {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    };
    const writeLocalJson = (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    };
    const safeHttpUrl = (value, allowRelative = false) => {
        if (typeof value !== 'string' || !value.trim()) return null;
        try {
            const url = new URL(value, location.href);
            if (!['http:', 'https:'].includes(url.protocol)) return null;
            return allowRelative || /^https?:\/\//i.test(value) ? url.href : null;
        } catch {
            return null;
        }
    };
    const unwrapSettingScalar = (value) => {
        if (!isObject(value) || typeof value.toJSON !== 'function') return value;
        try {
            const serialized = value.toJSON();
            return serialized === null || ['string', 'number', 'boolean'].includes(typeof serialized) ? serialized : value;
        } catch {
            return value;
        }
    };
    const clone = (value) => {
        const scalar = unwrapSettingScalar(value);
        if (scalar !== value) return clone(scalar);
        if (Array.isArray(value)) return value.map(clone);
        if (!isObject(value)) return value;
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    };
    const mergeKnown = (defaults, input) => {
        if (Array.isArray(defaults)) return Array.isArray(input) ? clone(input) : clone(defaults);
        const scalar = unwrapSettingScalar(input);
        if (defaults === null) {
            return scalar === null || ['string', 'number', 'boolean'].includes(typeof scalar) ? scalar : null;
        }
        if (!isObject(defaults)) return typeof scalar === typeof defaults ? scalar : defaults;
        const result = {};
        for (const [key, fallback] of Object.entries(defaults)) {
            result[key] = mergeKnown(fallback, isObject(input) || Array.isArray(input) ? input[key] : undefined);
        }
        return result;
    };
    const getPath = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);
    const setPath = (value, path, next) => {
        const keys = path.split('.');
        const property = keys.pop();
        const target = keys.reduce((current, key) => current[key], value);
        target[property] = next;
    };
    const replaceInPlace = (target, source) => {
        if (Array.isArray(target) && Array.isArray(source)) {
            target.splice(0, target.length, ...clone(source));
            return target;
        }
        for (const key of Object.keys(target)) {
            if (!own(source, key)) delete target[key];
        }
        for (const [key, value] of Object.entries(source)) {
            if (isObject(target[key]) && isObject(value)) replaceInPlace(target[key], value);
            else if (Array.isArray(target[key]) && Array.isArray(value)) replaceInPlace(target[key], value);
            else target[key] = clone(value);
        }
        return target;
    };
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // ~ Persistent data stores                                                            ~
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~