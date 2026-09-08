import React from 'react';

const SectionDivider = ({ type = 'wave', color, backgroundColor = 'transparent', height = '60px', flip = false }) => {
    const style = {
        backgroundColor: backgroundColor,
        lineHeight: 0,
        width: '100%',
        height: height,
        transform: flip ? 'scaleX(-1)' : 'none',
        position: 'relative',
        zIndex: 1
    };

    const renderSvg = () => {
        switch (type) {
            case 'wave':
                return (
                    <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                        <path d="M0 120L1440 120L1440 0C1440 0 1082.5 99.5 720 99.5C357.5 99.5 0 0 0 0L0 120Z" fill={color} />
                    </svg>
                );
            case 'slant':
                return (
                    <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                        <path d="M0 100L1440 100L1440 0L0 100Z" fill={color} />
                    </svg>
                );
            case 'curve':
                return (
                    <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                        <path d="M0 100L1440 100L1440 0C1440 0 720 100 0 0L0 100Z" fill={color} />
                    </svg>
                );
            case 'zigzag':
                return (
                    <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                        <path d="M0 100L1440 100L1440 0L1380 30L1320 0L1260 30L1200 0L1140 30L1080 0L1020 30L960 0L900 30L840 0L780 30L720 0L660 30L600 0L540 30L480 0L420 30L360 0L300 30L240 0L180 30L120 0L60 30L0 0L0 100Z" fill={color} />
                    </svg>
                );
            case 'grass':
                return (
                    <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                        {/* Hill base with grass blades on top - curves from left high to center low to right medium */}
                        <path d={`
                            M0 120 L0 70 
                            Q5 40, 10 65 Q15 30, 20 60 Q25 20, 30 55 Q35 35, 40 62
                            Q50 25, 55 58 Q60 15, 65 52 Q70 28, 75 60 Q80 18, 85 55
                            Q95 22, 100 58 Q105 12, 110 50 Q115 32, 120 62 Q125 20, 130 55
                            Q140 28, 145 60 Q150 15, 155 52 Q160 25, 165 58 Q170 18, 175 55
                            Q185 30, 190 62 Q195 22, 200 55 Q205 15, 210 52 Q215 28, 220 60
                            Q230 20, 235 56 Q240 12, 245 50 Q250 32, 255 62 Q260 22, 265 55
                            Q275 25, 280 58 Q285 18, 290 52 Q295 30, 300 62 Q305 20, 310 55
                            Q320 28, 325 60 Q330 15, 335 52 Q340 25, 345 58 Q350 22, 355 55
                            Q365 18, 370 52 Q375 30, 380 62 Q385 20, 390 55 Q395 12, 400 50
                            Q410 28, 415 60 Q420 18, 425 52 Q430 32, 435 62 Q440 22, 445 55
                            Q455 25, 460 58 Q465 15, 470 50 Q475 28, 480 60 Q485 20, 490 55
                            Q500 30, 505 62 Q510 18, 515 52 Q520 25, 525 58 Q530 12, 535 50
                            Q545 28, 550 60 Q555 20, 560 55 Q565 32, 570 62 Q575 22, 580 55
                            Q590 18, 595 52 Q600 30, 605 62 Q610 20, 615 55 Q620 12, 625 50
                            Q635 28, 640 60 Q645 22, 650 55 Q655 32, 660 62 Q665 18, 670 52
                            Q680 25, 685 58 Q690 15, 695 52 Q700 30, 705 62 Q710 20, 715 55
                            Q725 28, 730 60 Q735 18, 740 52 Q745 25, 750 58 Q750 22, 755 55
                            Q765 30, 770 62 Q775 18, 780 52 Q785 32, 790 62 Q795 20, 800 55
                            Q810 25, 815 58 Q820 12, 825 50 Q830 28, 835 60 Q840 22, 845 55
                            Q855 18, 860 52 Q865 30, 870 62 Q875 20, 880 55 Q885 32, 890 62
                            Q900 25, 905 58 Q910 15, 915 52 Q920 28, 925 60 Q930 22, 935 55
                            Q945 18, 950 52 Q955 30, 960 62 Q965 20, 970 55 Q975 12, 980 50
                            Q990 28, 995 60 Q1000 22, 1005 55 Q1010 32, 1015 62 Q1020 18, 1025 52
                            Q1035 25, 1040 58 Q1045 15, 1050 52 Q1055 28, 1060 60 Q1065 20, 1070 55
                            Q1080 30, 1085 62 Q1090 18, 1095 52 Q1100 25, 1105 58 Q1110 22, 1115 55
                            Q1125 28, 1130 60 Q1135 15, 1140 52 Q1145 32, 1150 62 Q1155 20, 1160 55
                            Q1170 18, 1175 52 Q1180 30, 1185 62 Q1190 22, 1195 55 Q1200 12, 1205 50
                            Q1215 28, 1220 60 Q1225 20, 1230 55 Q1235 32, 1240 62 Q1245 18, 1250 52
                            Q1260 25, 1265 58 Q1270 15, 1275 52 Q1280 28, 1285 60 Q1290 22, 1295 55
                            Q1305 30, 1310 62 Q1315 18, 1320 52 Q1325 25, 1330 58 Q1335 20, 1340 55
                            Q1350 28, 1355 60 Q1360 15, 1365 52 Q1370 32, 1375 62 Q1380 22, 1385 55
                            Q1395 25, 1400 58 Q1405 12, 1410 50 Q1415 28, 1420 60 Q1425 20, 1430 55
                            Q1435 30, 1440 52 L1440 120 Z
                        `} fill={color} />
                        {/* Curved hill overlay for depth */}
                        <ellipse cx="720" cy="140" rx="900" ry="60" fill={color} />
                    </svg>
                );
            default:
                return null;
        }
    };

    return (
        <div style={style}>
            {renderSvg()}
        </div>
    );
};

export default SectionDivider;
