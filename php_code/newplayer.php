<?php
include_once 'character_table.php';
?>
<html>
    <head>
        <meta charset="UTF-8">
        <link rel="stylesheet" type="text/css" href="styleBG.css">
        <title>人物設定</title>
    </head>
    <body>
        <header>
            人物設定
        </header>
    <inputfield>
        <span class="error">* required field</span>
        <form method="post" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>" autocomplete="off">  
            探索者姓名(PC): <input type="text" name="pc" value="<?php echo $pc ?>" autofocus>
            <span class="error">* <?php echo $pcErr; ?></span><br>
            玩家姓名(PL): <input type="text" name="pl" value="<?php echo $pl ?>" autofocus>
            <span class="error">* <?php echo $plErr; ?></span><br>
            年齡: <input type="text" name="age"  value="<?php echo $age ?>">
            <span class="error">* <?php echo $ageErr; ?></span><br>
            Gender:
            <input type="radio" name="gender" <?php if (isset($gender) && $gender == "Male") echo "checked"; ?> value="Male">Male
            <input type="radio" name="gender" <?php if (isset($gender) && $gender == "Female") echo "checked"; ?> value="Female">Female
            <input type="radio" name="gender" <?php if (isset($gender) && $gender == "Other") echo "checked"; ?> value="Other">Other  
            <span class="error">* <?php echo $genderErr; ?></span><br>
            <b>屬性</b><br>
            力量: <input type="text" name="STR" value="<?php echo $STR ?>"><span class="error"><?php echo $STRErr; ?></span><br>你的角色執行推、拉、搬動等動作時所需的能力<br><br>
            敏捷: <input type="text" name="DEX" value="<?php echo $DEX ?>"><span class="error"><?php echo $DEXErr; ?></span><br>代表你的肢體靈巧、協調、速度等，戰鬥時的先後順位<br><br>
            體質: <input type="text" name="CON" value="<?php echo $CON ?>"><span class="error"><?php echo $CONErr; ?></span><br>這個包括了身體素質，活力和精力。可能是憋氣的多寡或是毒抗<br><br>
            外表: <input type="text" name="APP" value="<?php echo $APP ?>"><span class="error"><?php echo $APPErr; ?></span><br>會給人強烈的第一印象，好看的外表讓你更利於與NPC交涉<br><br>
            意志: <input type="text" name="POW" value="<?php echo $POW ?>"><span class="error"><?php echo $POWErr; ?></span><br>意志力堅強的人較不容易動搖，重要的SAN值也是依此決定<br><br>
            智力: <input type="text" name="INT" value="<?php echo $INT ?>"><span class="error"><?php echo $INTErr; ?></span><br>角色對事物的理解能力，但有時候知道太多並不是好事<br><br>
            體型: <input type="text" name="SIZ" value="<?php echo $SIZ ?>"><span class="error"><?php echo $SIZErr; ?></span><br>體型大的人在肉搏戰可能佔有優勢，體型小也有行動便利的優點<br><br>
            教育: <input type="text" name="EDU" value="<?php echo $EDU ?>"><span class="error"><?php echo $EDUErr; ?></span><br>通常15等於一般大學程度<br>
            <input type="submit" name="submit" value="提交">
            <input type="submit" name="gorandom" value="隨機數值">
        </form>
    </inputfield>

</body>
</html>
