<html>
    <head>
        <meta charset="UTF-8">
        <link rel="stylesheet" type="text/css" href="styleBG.css">
        <title>Player</title>
    </head>
    <style>
        .error {color: #FF0000;}
    </style>
    <body>
        <header>
            Step 1: 人物設定
        </header>
            <?php
            include_once 'character_table.php';
            ?>
            <displayfield>
                <?php
                echo "<h2>Player list:</h2>";
                echo "探索者姓名: $pc";
                echo "<br>";
                echo "玩家姓名: $pl";
                echo "<br>";
                echo "年齡: $age";
                echo "<br>";
                echo "性別: $gender";
                echo "<br>";
                echo "力量: $STR";
                echo "    ";
                echo "敏捷: $DEX";
                echo "    ";
                echo "體質: $CON";
                echo "<br>";
                echo "外表: $APP";
                echo "    ";
                echo "意志: $POW";
                echo "    ";
                echo "智力: $INT";
                echo "<br>";
                echo "體型: $SIZ";
                echo "    ";
                echo "教育: $EDU";
                echo "    ";
                echo "SAN值: $SAN";
                echo "<br>";
                echo "靈感: $IDEA";
                echo "    ";
                echo "幸運: $LUCK";
                echo "    ";
                echo "知識: $KNOW";
                echo "<br>";
                ?>
            </displayfield>
    </body>
</html>
