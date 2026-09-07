import type { Quote } from './quotes';

const TRUYEN_KIEU = 'https://vi.wikisource.org/wiki/Truy%E1%BB%87n_Ki%E1%BB%81u';
const LUC_VAN_TIEN = 'https://vi.wikisource.org/wiki/L%E1%BB%A5c_V%C3%A2n_Ti%C3%AAn_(b%E1%BA%A3n_Qu%E1%BB%91c_ng%E1%BB%AF_2082_c%C3%A2u)/I';
const NHAN = 'https://vi.wikisource.org/wiki/Nh%C3%A0n';
const CANH_NHAN = 'https://vi.wikisource.org/wiki/C%E1%BA%A3nh_nh%C3%A0n';
const CAM_KY_THI_TUU_2 = 'https://vi.wikisource.org/wiki/C%E1%BA%A7m_k%E1%BB%B3_thi_t%E1%BB%ADu/B%C3%A0i_2';
const KE_SI = 'https://vi.wikisource.org/wiki/K%E1%BA%BB_s%C4%A9';
const COM_VONG = 'https://vi.wikisource.org/wiki/H%C3%A0_N%E1%BB%99i_b%C4%83m_s%C3%A1u_ph%E1%BB%91_ph%C6%B0%E1%BB%9Dng/M%E1%BB%99t_th%E1%BB%A9_qu%C3%A0_c%E1%BB%A7a_l%C3%BAa_non:_c%E1%BB%91m';
const VN_PHONG_TUC_I4 = 'https://vi.wikisource.org/wiki/Vi%E1%BB%87t_Nam_phong_t%E1%BB%A5c/I.4';
const VN_PHONG_TUC_I12 = 'https://vi.wikisource.org/wiki/Vi%E1%BB%87t_Nam_phong_t%E1%BB%A5c/I.12';
const DUOI_BONG_HOANG_LAN = 'https://vi.wikisource.org/wiki/D%C6%B0%E1%BB%9Bi_b%C3%B3ng_ho%C3%A0ng_lan';
const GIO_LANH_DAU_MUA = 'https://vi.wikisource.org/wiki/Gi%C3%B3_l%E1%BA%A1nh_%C4%91%E1%BA%A7u_m%C3%B9a';

export const vi: readonly Quote[] = [
  { text: 'Trăm năm trong cõi người ta,\nChữ tài chữ mệnh khéo là ghét nhau.', work: 'Truyện Kiều', author: 'Nguyễn Du', source: TRUYEN_KIEU },
  { text: 'Mai cốt cách, tuyết tinh thần,\nMột người một vẻ, mười phân vẹn mười.', work: 'Truyện Kiều', author: 'Nguyễn Du', source: TRUYEN_KIEU },
  { text: 'Làn thu thủy, nét xuân sơn,\nHoa ghen thua thắm, liễu hờn kém xanh.', work: 'Truyện Kiều', author: 'Nguyễn Du', source: TRUYEN_KIEU },
  { text: 'Nguyên người quanh quất đâu xa,\nHọ Kim tên Trọng vốn nhà trâm anh.', work: 'Truyện Kiều', author: 'Nguyễn Du', source: TRUYEN_KIEU },
  { text: 'Người quốc sắc, kẻ thiên tài,\nTình trong như đã, mặt ngoài còn e.', work: 'Truyện Kiều', author: 'Nguyễn Du', source: TRUYEN_KIEU },
  { text: 'Dưới cầu nước chảy trong veo,\nBên cầu tơ liễu bóng chiều thướt tha.', work: 'Truyện Kiều', author: 'Nguyễn Du', source: TRUYEN_KIEU },

  { text: 'Trước đèn xem truyện Tây minh,\nGẫm cười hai chữ nhơn tình éo le.', work: 'Lục Vân Tiên', author: 'Nguyễn Đình Chiểu', source: LUC_VAN_TIEN },
  { text: 'Trai thời trung hiếu làm đầu,\nGái thời tiết hạnh là câu trau mình.', work: 'Lục Vân Tiên', author: 'Nguyễn Đình Chiểu', source: LUC_VAN_TIEN },
  { text: 'Có người ở quận Đông-thành,\nTu nhân tích đức sớm sanh con hiền.', work: 'Lục Vân Tiên', author: 'Nguyễn Đình Chiểu', source: LUC_VAN_TIEN },

  { text: 'Thân em vừa trắng lại vừa tròn,\nBảy nổi ba chìm với nước non.\nRắn nát mặc dầu tay kẻ nặn.\nMà em vẫn giữ tấm lòng son.', work: 'Bánh trôi nước', author: 'Hồ Xuân Hương', source: 'https://vi.wikisource.org/wiki/B%C3%A1nh_tr%C3%B4i_n%C6%B0%E1%BB%9Bc' },

  { text: 'Bước xuống Đèo Ngang, bóng xế tà,\nCỏ cây chen đá, lá chen hoa.', work: 'Qua đèo Ngang', author: 'Bà Huyện Thanh Quan', source: 'https://vi.wikisource.org/wiki/Qua_%C4%91%C3%A8o_Ngang_(B%C3%A0_Huy%E1%BB%87n_Thanh_Quan)' },
  { text: 'Đá vẫn trơ gan cùng tuế nguyệt,\nNước còn cau mặt với tang thương.', work: 'Thăng Long thành hoài cổ', author: 'Bà Huyện Thanh Quan', source: 'https://vi.wikisource.org/wiki/Th%C4%83ng_Long_th%C3%A0nh_ho%C3%A0i_c%E1%BB%95' },

  { text: 'Ao thu lạnh lẽo nước trong veo,\nMột chiếc thuyền câu bé tẻo teo.', work: 'Thu điếu', author: 'Nguyễn Khuyến', source: 'https://vi.wikisource.org/wiki/Thu_%C4%91i%E1%BA%BFu' },
  { text: 'Trời thu xanh ngắt mấy tầng cao,\nCần trúc lơ phơ gió hắt hiu.', work: 'Thu vịnh', author: 'Nguyễn Khuyến', source: 'https://vi.wikisource.org/wiki/Thu_v%E1%BB%8Bnh' },
  { text: 'Năm gian nhà cỏ thấp le te,\nNgõ tối đêm sâu đóm lập lòe,', work: 'Thu ẩm', author: 'Nguyễn Khuyến', source: 'https://vi.wikisource.org/wiki/Thu_%E1%BA%A9m' },

  { text: 'Quanh năm buôn bán ở mom sông\nNuôi đủ năm con với một chồng.', work: 'Thương vợ', author: 'Trần Tế Xương', source: 'https://vi.wikisource.org/wiki/Th%C6%B0%C6%A1ng_v%E1%BB%A3' },
  { text: 'Sông kia rày đã nên đồng\nChỗ làm nhà cửa chỗ trồng ngô khoai', work: 'Sông Lấp', author: 'Trần Tế Xương', source: 'https://vi.wikisource.org/wiki/S%C3%B4ng_L%E1%BA%A5p' },

  { text: 'Nước non nặng một nhời thề,\nNước đi đi mãi không về cùng non.', work: 'Thề non nước', author: 'Tản Đà', source: 'https://vi.wikisource.org/wiki/Th%E1%BB%81_non_n%C6%B0%E1%BB%9Bc_(th%C6%A1)' },
  { text: 'Lá đào rơi rắc lối Thiên Thai,\nSuối tiễn, oanh đưa, những ngậm ngùi.', work: 'Tống biệt', author: 'Tản Đà', source: 'https://vi.wikisource.org/wiki/T%E1%BB%91ng_bi%E1%BB%87t' },

  { text: 'Sao anh không về chơi thôn Vĩ?\nNhìn nắng hàng cau nắng mới lên,', work: 'Đây thôn Vĩ Dạ', author: 'Hàn Mặc Tử', source: 'https://vi.wikisource.org/wiki/%C4%90%C3%A2y_th%C3%B4n_V%C4%A9_D%E1%BA%A1' },
  { text: 'Trong làn nắng ửng: khói mơ tan.\nĐôi mái nhà tranh lấm tấm vàng.', work: 'Mùa xuân chín', author: 'Hàn Mặc Tử', source: 'https://vi.wikisource.org/wiki/M%C3%B9a_xu%C3%A2n_ch%C3%ADn' },

  { text: 'Thôn Đoài ngồi nhớ thôn Đông\nMột người chín nhớ mười mong một người.', work: 'Tương tư', author: 'Nguyễn Bính', source: 'https://vi.wikisource.org/wiki/T%C6%B0%C6%A1ng_t%C6%B0' },
  { text: 'Hôm qua, em đi tỉnh về\nĐợi em ở mãi con đê đầu làng', work: 'Chân quê', author: 'Nguyễn Bính', source: 'https://vi.wikisource.org/wiki/Ch%C3%A2n_qu%C3%AA' },

  { text: 'Chiều, chiều rồi. Một chiều êm ả như ru, văng vẳng tiếng ếch nhái kêu ran ngoài đồng ruộng theo gió nhẹ đưa vào.', work: 'Hai đứa trẻ', author: 'Thạch Lam', source: 'https://vi.wikisource.org/wiki/Hai_%C4%91%E1%BB%A9a_tr%E1%BA%BB' },
  { text: 'Liên thấy mình sống giữa bao nhiêu sự xa xôi không biết như chiếc đèn con của chị Tí chỉ chiếu sáng một vùng đất nhỏ.', work: 'Hai đứa trẻ', author: 'Thạch Lam', source: 'https://vi.wikisource.org/wiki/Hai_%C4%91%E1%BB%A9a_tr%E1%BA%BB' },

  { text: 'Một mai, một cuốc, một cần câu,\nThơ thẩn cùng ai vui thú nào.', work: 'Nhàn', author: 'Nguyễn Bỉnh Khiêm', source: NHAN },
  { text: 'Rượu, đến cội cây, ta sẽ nhắp,\nNhìn xem phú quý tựa chiêm bao.', work: 'Nhàn', author: 'Nguyễn Bỉnh Khiêm', source: NHAN },
  { text: 'Dù nhẫn chê khen, dù miệng thế,\nCơ-mầu tạo-hóa mặc tự-nhiên.', work: 'Cảnh nhàn', author: 'Nguyễn Bỉnh Khiêm', source: CANH_NHAN },

  { text: 'Cầm, kỳ, thi, tửu,\nĐường ăn chơi mỗi vẽ mỗi hay.', work: 'Cầm kỳ thi tửu', author: 'Nguyễn Công Trứ', source: CAM_KY_THI_TUU_2 },
  { text: 'Chơi cho lịch mới là chơi,\nChơi cho đài-các, cho người biết tay.', work: 'Cầm kỳ thi tửu', author: 'Nguyễn Công Trứ', source: CAM_KY_THI_TUU_2 },
  { text: 'Mặc ai hỏi, mặc ai không hỏi tới,\nGẫm việc đời mà ngắm kẻ trọc thanh.', work: 'Kẻ sĩ', author: 'Nguyễn Công Trứ', source: KE_SI },

  { text: 'Cốm là thức quà đặc biệt riêng của đất nước, là thức dâng của những cánh đồng lúa bát ngát xanh', work: 'Một thứ quà của lúa non: cốm', author: 'Thạch Lam', source: COM_VONG },
  { text: 'Chúng ta thấy hiện ra từng lá cốm, sạch sẽ và tinh khiết, không có mảy may chút bụi nào', work: 'Một thứ quà của lúa non: cốm', author: 'Thạch Lam', source: COM_VONG },

  { text: 'Nhà thờ ấy chỉ thờ riêng một Thủy-tổ, và khi tế tự thì lấy các Tổ-tôn biệt chi biệt phái mà phối hưởng.', work: 'Việt Nam phong tục', author: 'Phan Kế Bính', source: VN_PHONG_TUC_I4 },
  { text: 'Dẫu nghèo thế nào cũng có một bàn thờ.', work: 'Việt Nam phong tục', author: 'Phan Kế Bính', source: VN_PHONG_TUC_I4 },
  { text: 'Thần-chủ làm bằng gỗ táo, lấy nghĩa rằng gỗ táo sống lâu được nghìn năm.', work: 'Việt Nam phong tục', author: 'Phan Kế Bính', source: VN_PHONG_TUC_I4 },
  { text: 'Trước nửa tháng Tết, nhà nào nhà ấy đã rộn rịp sắm Tết', work: 'Việt Nam phong tục', author: 'Phan Kế Bính', source: VN_PHONG_TUC_I12 },
  { text: 'Anh em, họ hàng, người quen thuộc, đến lẫn nhà nhau lạy gia tiên, chúc mừng cho nhau', work: 'Việt Nam phong tục', author: 'Phan Kế Bính', source: VN_PHONG_TUC_I12 },

  { text: 'Một mùi lá tươi non phảng phất trong không khí.', work: 'Dưới bóng hoàng lan', author: 'Thạch Lam', source: DUOI_BONG_HOANG_LAN },
  { text: 'Thanh thấy tâm hồn nhẹ nhõm tươi mát như vừa tắm ở suối.', work: 'Dưới bóng hoàng lan', author: 'Thạch Lam', source: DUOI_BONG_HOANG_LAN },
  { text: 'Mỗi mùa cô lại giắt hoàng lan trong mái tóc để tưởng nhớ mùi hương.', work: 'Dưới bóng hoàng lan', author: 'Thạch Lam', source: DUOI_BONG_HOANG_LAN },

  { text: 'Mẹ Sơn vuốt các tà áo cho phẳng phiu, rồi đẩy Sơn ra, bảo: Thôi, con đi chơi.', work: 'Gió lạnh đầu mùa', author: 'Thạch Lam', source: GIO_LANH_DAU_MUA },
  { text: 'Mẹ Sơn với cái âu đồng, lấy tiền đưa cho bác Hiên: Đây, tôi cho mượn năm hào cầm về mà may áo cho con.', work: 'Gió lạnh đầu mùa', author: 'Thạch Lam', source: GIO_LANH_DAU_MUA },

];
