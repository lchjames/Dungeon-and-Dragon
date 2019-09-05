$(document).ready(function(){
	var stt = 0;
	$("img.slide").each(function(){
		if($(this).is(':visible'))
			stt = $(this).attr("stt");
	});
	$("#next").click(function(){
		next = ++stt;
		$("img.slide").hide();
		$("img.slide").eq(next).show();
	})
});